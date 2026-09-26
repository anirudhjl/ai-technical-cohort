// Orchestrator — builds the plan for a case, persists the Workflow Case
// Record, delegates to sub-agents in a fixed order, and enforces the
// mandatory human-approval checkpoint before Master Data Agent may run.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createCase, getCase, listCases, updateCase } from "../state/caseStore.js";
import { writeTraceStep } from "../skills/audit-trace-writer.js";
import { runSourceIntakeAgent } from "../agents/sourceIntakeAgent.js";
import { runIdentityResolutionAgent } from "../agents/identityResolutionAgent.js";
import { runAddressValidationAgent } from "../agents/addressValidationAgent.js";
import { runReconciliationAgent } from "../agents/reconciliationAgent.js";
import { runConfidenceQualityAgent } from "../agents/confidenceQualityAgent.js";
import { runGuardrailComplianceAgent } from "../agents/guardrailComplianceAgent.js";
import { runMasterDataAgent } from "../agents/masterDataAgent.js";
import { SourceRecordSchema, type RawAddress, type SourceRecord, type WorkflowCaseRecord } from "../types/case.js";
import type { DemoUser } from "../types/user.js";

const SAMPLE_SOURCES_DIR = path.resolve(process.cwd(), "data", "sample-sources");

export async function pickNextSampleSource(): Promise<SourceRecord> {
  const files = (await readdir(SAMPLE_SOURCES_DIR)).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0) {
    throw new Error("No seeded sample-source records found under data/sample-sources/.");
  }
  const existingCases = await listCases();
  const usedSourceIds = new Set(existingCases.map((c) => c.request.rawPayload.sourceId));

  for (const file of files) {
    const raw = JSON.parse(await readFile(path.join(SAMPLE_SOURCES_DIR, file), "utf-8"));
    const parsed = SourceRecordSchema.parse(raw);
    if (!usedSourceIds.has(parsed.sourceId)) return parsed;
  }
  // Every seeded record has already been ingested at least once — wrap
  // around so the demo can be re-run without a restart.
  const raw = JSON.parse(await readFile(path.join(SAMPLE_SOURCES_DIR, files[0]!), "utf-8"));
  return SourceRecordSchema.parse(raw);
}

/** Runs the fully-automated portion of the pipeline for a brand-new source record. */
export async function runCase(sourceRecord: SourceRecord): Promise<WorkflowCaseRecord> {
  let record = await createCase(sourceRecord);
  record = await writeTraceStep({
    caseId: record.caseId,
    agent: "orchestrator",
    decision: `Case ${record.caseId} created from source "${sourceRecord.sourceSystem}" (${sourceRecord.sourceId}); plan: source-intake -> identity-resolution -> address-validation -> reconciliation -> confidence-quality -> guardrail-compliance -> human approval -> master-data.`,
    maskablePayload: { name: sourceRecord.hcpNameRaw, npi: sourceRecord.npi },
  });

  record = await runSourceIntakeAgent(record);
  if (record.status === "blocked") return record;

  record = await runIdentityResolutionAgent(record);
  record = await runAddressValidationAgent(record);
  record = await runReconciliationAgent(record);
  record = await runConfidenceQualityAgent(record);
  record = await runGuardrailComplianceAgent(record);
  return record;
}

export async function ingestNextCase(): Promise<WorkflowCaseRecord> {
  const sourceRecord = await pickNextSampleSource();
  return runCase(sourceRecord);
}

export interface ApprovalDecisionInput {
  caseId: string;
  decision: "approved" | "rejected";
  approver: DemoUser;
  reason: string;
  /** Optional Data Steward edit to the standardized address before it is applied. */
  editedAddress?: RawAddress;
}

export async function recordHumanApproval(input: ApprovalDecisionInput): Promise<WorkflowCaseRecord> {
  const existing = await getCase(input.caseId);
  if (!existing) {
    throw new Error(`No such case: ${input.caseId}`);
  }
  if (existing.status !== "awaiting_approval") {
    throw new Error(`Case ${input.caseId} is not awaiting approval (status: ${existing.status}).`);
  }
  if (input.approver.role !== "data_steward") {
    throw new Error("Only a Data Steward may approve or reject a case.");
  }

  let record = await updateCase(input.caseId, {
    humanApproval: {
      status: input.decision,
      approver: input.approver.name,
      role: "data_steward",
      reason: input.reason,
      timestamp: new Date().toISOString(),
    },
    ...(input.editedAddress
      ? { address: { ...existing.address, standardized: input.editedAddress } }
      : {}),
  });

  record = await writeTraceStep({
    caseId: input.caseId,
    agent: "orchestrator",
    evidence: input.editedAddress ? "Data Steward edited the standardized address before deciding." : undefined,
    decision: `Data Steward "${input.approver.name}" ${input.decision} this case: ${input.reason}`,
  });

  if (input.decision === "rejected") {
    return updateCase(input.caseId, {
      status: "rejected",
      finalAction: { type: "rejected_no_action", appliedAt: new Date().toISOString() },
    });
  }

  return runMasterDataAgent(record);
}
