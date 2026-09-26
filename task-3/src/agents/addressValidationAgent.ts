// Address Validation Agent — standardizes the raw incoming address and never
// invents a missing field (guardrail: no unsupported address generation).
import { standardizeAddress } from "../skills/address-standardizer.js";
import { writeTraceStep } from "../skills/audit-trace-writer.js";
import { checkNoUnsupportedAddressGeneration } from "../guardrails/rules.js";
import { updateCase } from "../state/caseStore.js";
import type { RawAddress, WorkflowCaseRecord } from "../types/case.js";

const AGENT = "address-validation";
const REQUIRED_FIELDS: Array<keyof RawAddress> = ["line1", "city", "state", "postalCode"];

function isCompleteAddress(candidate: Partial<RawAddress>): candidate is RawAddress {
  return REQUIRED_FIELDS.every((field) => typeof candidate[field] === "string" && candidate[field] !== "");
}

export async function runAddressValidationAgent(caseRecord: WorkflowCaseRecord): Promise<WorkflowCaseRecord> {
  const raw = caseRecord.address.raw;
  const result = await standardizeAddress({ caseId: caseRecord.caseId, agent: AGENT }, raw);
  const guardrailCheck = checkNoUnsupportedAddressGeneration(result.validationFlags);

  // A standardized address is only ever stored when every required field is
  // genuinely present — never a partially-fabricated object. Missing fields
  // stay visible purely as validationFlags.
  const standardized = isCompleteAddress(result.standardized)
    ? { ...result.standardized, country: result.standardized.country ?? "US" }
    : undefined;

  let updated = await updateCase(caseRecord.caseId, {
    address: { raw, standardized, validationFlags: result.validationFlags },
    guardrailChecks: [...caseRecord.guardrailChecks, guardrailCheck],
  });

  updated = await writeTraceStep({
    caseId: caseRecord.caseId,
    agent: AGENT,
    skill: "address-standardizer",
    tool: "address-validation.validate_address",
    evidence: `Validation flags: ${result.validationFlags.join(", ") || "none"}.`,
    decision: standardized
      ? "Address standardized successfully and passed validation."
      : "Address could not be fully standardized; required field(s) left blank rather than invented.",
    maskablePayload: { line1: raw.line1, line2: raw.line2, city: raw.city, state: raw.state, postalCode: raw.postalCode },
  });

  return updated;
}
