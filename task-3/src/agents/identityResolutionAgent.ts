// Identity Resolution Agent — matches the incoming record to an existing HCP
// master record and computes a rules-based identity confidence. Never
// proceeds autonomously below the confidence floor (guardrail).
import { matchIdentity } from "../skills/identity-matcher.js";
import { writeTraceStep } from "../skills/audit-trace-writer.js";
import { checkIdentityConfidenceFloor } from "../guardrails/rules.js";
import { updateCase } from "../state/caseStore.js";
import type { WorkflowCaseRecord } from "../types/case.js";

const AGENT = "identity-resolution";

export async function runIdentityResolutionAgent(caseRecord: WorkflowCaseRecord): Promise<WorkflowCaseRecord> {
  const source = caseRecord.request.rawPayload;
  const match = await matchIdentity({ caseId: caseRecord.caseId, agent: AGENT }, source);
  const guardrailCheck = checkIdentityConfidenceFloor(match.confidence);

  let updated = await updateCase(caseRecord.caseId, {
    identity: {
      candidateHcpId: match.candidateHcpId,
      confidence: match.confidence,
      evidence: match.evidence,
    },
    guardrailChecks: [...caseRecord.guardrailChecks, guardrailCheck],
  });

  updated = await writeTraceStep({
    caseId: caseRecord.caseId,
    agent: AGENT,
    skill: "identity-matcher",
    tool: "crm-mdm.search_hcp_by_identity",
    evidence: match.evidence.join(" "),
    decision: match.candidateHcpId
      ? `Candidate identity ${match.candidateHcpId} at confidence ${match.confidence.toFixed(2)}.`
      : `No candidate identity found (confidence ${match.confidence.toFixed(2)}).`,
    maskablePayload: { name: source.hcpNameRaw, npi: source.npi },
  });

  return updated;
}
