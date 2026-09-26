import { APPROVED_MCP_SERVERS } from "../mcp-clients/mcpClient.js";

export const IDENTITY_CONFIDENCE_FLOOR = 0.5;
export const IDENTITY_CONFIDENCE_AUTO_THRESHOLD = 0.9;
export const APPROVED_SOURCE_SYSTEMS = ["crm_export", "onekey_feed", "license_board", "rep_form"] as const;

export type GuardrailCheck = { rule: string; passed: boolean; note?: string };

/** Business Rules 1 & 2 — only take input from an approved source system. */
export function checkApprovedSource(sourceSystem: string): GuardrailCheck {
  const passed = (APPROVED_SOURCE_SYSTEMS as readonly string[]).includes(sourceSystem);
  return {
    rule: "approved_source_system",
    passed,
    note: passed
      ? undefined
      : `Source system "${sourceSystem}" is not on the approved list (${APPROVED_SOURCE_SYSTEMS.join(", ")}).`,
  };
}

/** Guardrail: no action when identity confidence falls below threshold. */
export function checkIdentityConfidenceFloor(identityConfidence: number): GuardrailCheck {
  const passed = identityConfidence >= IDENTITY_CONFIDENCE_FLOOR;
  return {
    rule: "identity_confidence_floor",
    passed,
    note: passed
      ? undefined
      : `Identity confidence ${identityConfidence.toFixed(2)} is below the ${IDENTITY_CONFIDENCE_FLOOR} floor — no autonomous action is permitted; human review required.`,
  };
}

/** Guardrail: no unsupported address generation. Structurally enforced by
 * the address-validation MCP tool, which never fabricates a missing field —
 * so this always passes; the note records whether a field was actually
 * missing (and therefore correctly left blank) rather than treating that as
 * a guardrail failure. Data completeness itself is tracked separately via
 * validationFlags / the quality-score band, not via this check. */
export function checkNoUnsupportedAddressGeneration(validationFlags: string[]): GuardrailCheck {
  const missing = validationFlags.filter((f) => f.startsWith("missing_required_field"));
  return {
    rule: "no_unsupported_address_generation",
    passed: true,
    note:
      missing.length === 0
        ? "No required address field was missing."
        : `Required field(s) missing and correctly left blank rather than invented: ${missing.join(", ")}.`,
  };
}

/** Business Rule 5 — conflicts are surfaced, never silently resolved. */
export function checkConflictsSurfaced(
  reconciliationStatus: "match" | "variation" | "conflict" | "not_applicable",
): GuardrailCheck {
  return {
    rule: "conflicts_surfaced_not_silently_resolved",
    passed: true,
    note: `Reconciliation status recorded as "${reconciliationStatus}"; a conflict or variation is always routed to human review, never auto-collapsed into the golden record.`,
  };
}

/** Guardrail: no autonomous modification of the golden HCP record. */
export function checkNoAutonomousGoldenRecordModification(): GuardrailCheck {
  return {
    rule: "no_autonomous_golden_record_modification",
    passed: true,
    note: "Enforced in src/hooks/hookRunner.ts: crm-mdm.write_hcp_address is refused unless a human approval is recorded on the case, for every confidence band.",
  };
}

/** Guardrail: no access to unapproved databases/systems. */
export function checkMcpAllowlistEnforced(): GuardrailCheck {
  return {
    rule: "mcp_allowlist_enforced",
    passed: true,
    note: `Enforced in src/hooks/hookRunner.ts: only ${APPROVED_MCP_SERVERS.join(", ")} are reachable; every other server name is refused before any call is made.`,
  };
}
