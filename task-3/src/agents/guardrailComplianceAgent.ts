// Guardrail / Compliance Agent — the final automated gate before a case can
// reach a human approver. Runs the two structural guardrail checks that
// apply to every case (MCP allowlist, no autonomous golden-record write),
// and writes a plain-language approval summary for the Data Steward.
// Per CLAUDE.md, EVERY case halts here for human approval — the confidence
// band only changes how much evidence the Data Steward must review, never
// whether approval is required at all.
import {
  checkMcpAllowlistEnforced,
  checkNoAutonomousGoldenRecordModification,
} from "../guardrails/rules.js";
import { writeApprovalSummary } from "../orchestrator/llm.js";
import { writeTraceStep } from "../skills/audit-trace-writer.js";
import { logStep } from "../observability/logger.js";
import { updateCase } from "../state/caseStore.js";
import { callTool } from "../hooks/hookRunner.js";
import type { HcpMasterRecord, WorkflowCaseRecord } from "../types/case.js";
import type { MaskablePayload } from "../skills/pii-masker.js";

const AGENT = "guardrail-compliance";

export async function runGuardrailComplianceAgent(caseRecord: WorkflowCaseRecord): Promise<WorkflowCaseRecord> {
  const start = Date.now();
  const guardrailChecks = [
    ...caseRecord.guardrailChecks,
    checkMcpAllowlistEnforced(),
    checkNoAutonomousGoldenRecordModification(),
  ];

  let updated = await updateCase(caseRecord.caseId, {
    guardrailChecks,
    status: "awaiting_approval",
  });

  const summary = await writeApprovalSummary(updated);
  await logStep({
    caseId: caseRecord.caseId,
    agent: AGENT,
    skill: undefined,
    durationMs: Date.now() - start,
    outcome: "ok",
    modelUsed: summary.usedLlm ? summary.modelUsed : undefined,
    tokenUsage: summary.usedLlm ? summary.tokenUsage : undefined,
    note: summary.usedLlm ? "generated approval summary via LLM" : "llm_skipped: no API key, deterministic fallback used",
  });

  // The approval summary is built from the case record's own (unmasked)
  // reconciliation text, which may quote the golden record's address as well
  // as the incoming one (e.g. "on file Minneapolis, MN vs incoming ..."). A
  // read-only re-fetch here gets both sides in hand for masking — it does
  // not modify anything, so it doesn't touch the write guardrail above.
  let goldenRecord: HcpMasterRecord | undefined;
  if (updated.identity.candidateHcpId) {
    goldenRecord =
      ((await callTool(
        { caseId: caseRecord.caseId, agent: AGENT, noteForLog: "read golden record to mask approval summary" },
        "crm-mdm",
        "get_hcp_master",
        { hcpId: updated.identity.candidateHcpId },
      )) as HcpMasterRecord | null) ?? undefined;
  }

  const maskablePayload: MaskablePayload[] = [];
  if (updated.address.standardized) {
    const s = updated.address.standardized;
    maskablePayload.push({ line1: s.line1, line2: s.line2, city: s.city, state: s.state, postalCode: s.postalCode });
  }
  if (goldenRecord) {
    const g = goldenRecord.currentAddress;
    maskablePayload.push({ line1: g.line1, line2: g.line2, city: g.city, state: g.state, postalCode: g.postalCode });
  }

  const allPassed = guardrailChecks.every((c) => c.passed);
  updated = await writeTraceStep({
    caseId: caseRecord.caseId,
    agent: AGENT,
    skill: "audit-trace-writer",
    tool: "audit-store.append_audit_entry",
    evidence: summary.text,
    decision: allPassed
      ? "All guardrail checks passed; case routed to Data Steward for mandatory human approval."
      : "One or more guardrail checks failed; case flagged for Data Steward attention.",
    maskablePayload,
  });

  return updated;
}
