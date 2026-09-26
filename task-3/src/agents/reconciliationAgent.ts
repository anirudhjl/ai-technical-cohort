// Reconciliation Agent — compares the (standardized) incoming address to the
// matched HCP's golden-record address and classifies match / variation /
// conflict. Conflicts are always surfaced, never silently resolved
// (CLAUDE.md Business Rule 5).
import { callTool } from "../hooks/hookRunner.js";
import { writeTraceStep } from "../skills/audit-trace-writer.js";
import { checkConflictsSurfaced } from "../guardrails/rules.js";
import { updateCase } from "../state/caseStore.js";
import type { HcpMasterRecord, RawAddress, WorkflowCaseRecord } from "../types/case.js";

const AGENT = "reconciliation";

function norm(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function reconcile(
  incoming: RawAddress,
  golden: RawAddress,
): { status: "match" | "variation" | "conflict"; details: string[] } {
  if (norm(incoming.city) !== norm(golden.city) || norm(incoming.state) !== norm(golden.state)) {
    return {
      status: "conflict",
      details: [
        `City/state differ from the golden record: on file "${golden.city}, ${golden.state}" vs incoming "${incoming.city}, ${incoming.state}".`,
      ],
    };
  }
  if (norm(incoming.line1) !== norm(golden.line1) || norm(incoming.postalCode) !== norm(golden.postalCode)) {
    return {
      status: "conflict",
      details: [
        `Street or postal code differ from the golden record: on file "${golden.line1}, ${golden.postalCode}" vs incoming "${incoming.line1}, ${incoming.postalCode}".`,
      ],
    };
  }
  if (norm(incoming.line2) !== norm(golden.line2)) {
    return {
      status: "variation",
      details: [
        `Secondary address line differs from the golden record: on file "${golden.line2 ?? "(none)"}" vs incoming "${incoming.line2 ?? "(none)"}".`,
      ],
    };
  }
  return { status: "match", details: ["Standardized incoming address matches the golden record exactly."] };
}

export async function runReconciliationAgent(caseRecord: WorkflowCaseRecord): Promise<WorkflowCaseRecord> {
  const { candidateHcpId } = caseRecord.identity;
  const incoming = caseRecord.address.standardized ?? caseRecord.address.raw;

  let result: { status: "match" | "variation" | "conflict" | "not_applicable"; details: string[] };
  let goldenRecord: HcpMasterRecord | undefined;

  if (!candidateHcpId) {
    result = { status: "not_applicable", details: ["No candidate HCP identity to reconcile against."] };
  } else {
    goldenRecord =
      ((await callTool(
        { caseId: caseRecord.caseId, agent: AGENT, skill: undefined, noteForLog: "read golden record for reconciliation" },
        "crm-mdm",
        "get_hcp_master",
        { hcpId: candidateHcpId },
      )) as HcpMasterRecord | null) ?? undefined;
    result = goldenRecord
      ? reconcile(incoming, goldenRecord.currentAddress)
      : { status: "not_applicable", details: [`Candidate ${candidateHcpId} not found in master data.`] };
  }

  const guardrailCheck = checkConflictsSurfaced(result.status);

  let updated = await updateCase(caseRecord.caseId, {
    reconciliation: { status: result.status, details: result.details },
    guardrailChecks: [...caseRecord.guardrailChecks, guardrailCheck],
  });

  updated = await writeTraceStep({
    caseId: caseRecord.caseId,
    agent: AGENT,
    tool: candidateHcpId ? "crm-mdm.get_hcp_master" : undefined,
    evidence: result.details.join(" "),
    decision: `Reconciliation status: ${result.status}.`,
    maskablePayload: [
      { line1: incoming.line1, line2: incoming.line2, city: incoming.city, state: incoming.state, postalCode: incoming.postalCode },
      goldenRecord
        ? {
            line1: goldenRecord.currentAddress.line1,
            line2: goldenRecord.currentAddress.line2,
            city: goldenRecord.currentAddress.city,
            state: goldenRecord.currentAddress.state,
            postalCode: goldenRecord.currentAddress.postalCode,
          }
        : {},
    ],
  });

  return updated;
}
