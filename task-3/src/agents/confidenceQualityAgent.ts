// Confidence & Quality Agent — combines identity confidence, reconciliation
// status, and address validity into a rules-based score + band
// (CLAUDE.md Business Rule 4: confidence must use defined validation rules).
import { scoreQuality } from "../skills/confidence-scorer.js";
import { writeTraceStep } from "../skills/audit-trace-writer.js";
import { updateCase } from "../state/caseStore.js";
import type { WorkflowCaseRecord } from "../types/case.js";

const AGENT = "confidence-quality";

export async function runConfidenceQualityAgent(caseRecord: WorkflowCaseRecord): Promise<WorkflowCaseRecord> {
  const qualityScore = scoreQuality({
    sourceSystem: caseRecord.request.sourceSystem,
    identityConfidence: caseRecord.identity.confidence,
    reconciliationStatus: caseRecord.reconciliation.status,
    addressValid: caseRecord.address.standardized !== undefined,
  });

  let updated = await updateCase(caseRecord.caseId, { qualityScore });

  updated = await writeTraceStep({
    caseId: caseRecord.caseId,
    agent: AGENT,
    skill: "confidence-scorer",
    evidence: qualityScore.ruleTrace.join(" "),
    decision: `Quality band: ${qualityScore.band} (score ${qualityScore.value.toFixed(2)}).`,
  });

  return updated;
}
