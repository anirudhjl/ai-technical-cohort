// Writes one traceability step to BOTH the mutable case record (full detail,
// for the Data Steward's in-app audit trail) and the independent append-only
// audit-store MCP ledger (PII-masked, per CLAUDE.md "mask sensitive data in
// logs"). Two separate writes, two separate stores, on purpose — see
// pii-masker.ts and audit-store.ts for why they must never be the same file.
import { appendAuditEntry as appendCaseAuditEntry } from "../state/caseStore.js";
import { callTool, type ToolCallContext } from "../hooks/hookRunner.js";
import { maskFreeText, type MaskablePayload } from "./pii-masker.js";
import type { WorkflowCaseRecord } from "../types/case.js";

export interface TraceStep {
  caseId: string;
  agent: string;
  skill?: string;
  tool?: string;
  evidence?: string;
  decision: string;
  /** Fields present in `evidence`/`decision` that must be masked before the ledger write. Pass an array when the text quotes more than one address (e.g. golden vs. incoming). */
  maskablePayload?: MaskablePayload | MaskablePayload[];
}

export async function writeTraceStep(step: TraceStep): Promise<WorkflowCaseRecord> {
  const updated = await appendCaseAuditEntry(step.caseId, {
    agent: step.agent,
    skill: step.skill,
    tool: step.tool,
    evidence: step.evidence,
    decision: step.decision,
  });

  const ctx: Pick<ToolCallContext, "caseId" | "agent" | "skill"> = {
    caseId: step.caseId,
    agent: step.agent,
    skill: step.skill,
  };
  const maskedEvidence = step.evidence
    ? maskFreeText(step.evidence, step.maskablePayload ?? {})
    : undefined;
  const maskedDecision = maskFreeText(step.decision, step.maskablePayload ?? {});

  await callTool(
    { ...ctx, noteForLog: "wrote audit entry to audit-store ledger" },
    "audit-store",
    "append_audit_entry",
    {
      caseId: step.caseId,
      timestamp: new Date().toISOString(),
      agent: step.agent,
      skill: step.skill,
      tool: step.tool,
      evidence: maskedEvidence,
      decision: maskedDecision,
    },
  );

  return updated;
}
