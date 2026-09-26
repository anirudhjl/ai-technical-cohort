import { describe, expect, it } from "vitest";
import {
  checkApprovedSource,
  checkConflictsSurfaced,
  checkIdentityConfidenceFloor,
  checkMcpAllowlistEnforced,
  checkNoAutonomousGoldenRecordModification,
  checkNoUnsupportedAddressGeneration,
  IDENTITY_CONFIDENCE_AUTO_THRESHOLD,
  IDENTITY_CONFIDENCE_FLOOR,
} from "../../src/guardrails/rules.js";

describe("checkApprovedSource — Business Rules 1 & 2", () => {
  it("passes for every approved source system", () => {
    for (const s of ["crm_export", "onekey_feed", "license_board", "rep_form"]) {
      expect(checkApprovedSource(s).passed).toBe(true);
    }
  });

  it("fails for an unapproved source system and names it in the note", () => {
    const result = checkApprovedSource("shadow_spreadsheet");
    expect(result.passed).toBe(false);
    expect(result.note).toContain("shadow_spreadsheet");
  });
});

describe("checkIdentityConfidenceFloor — no action below threshold", () => {
  it("passes at and above the floor", () => {
    expect(checkIdentityConfidenceFloor(IDENTITY_CONFIDENCE_FLOOR).passed).toBe(true);
    expect(checkIdentityConfidenceFloor(1).passed).toBe(true);
  });

  it("fails below the floor and explains why", () => {
    const result = checkIdentityConfidenceFloor(IDENTITY_CONFIDENCE_FLOOR - 0.01);
    expect(result.passed).toBe(false);
    expect(result.note).toContain("below the");
  });
});

describe("checkNoUnsupportedAddressGeneration", () => {
  it("always passes but records when a required field was correctly left blank", () => {
    const clean = checkNoUnsupportedAddressGeneration([]);
    expect(clean.passed).toBe(true);
    expect(clean.note).toContain("No required address field was missing");

    const missing = checkNoUnsupportedAddressGeneration(["missing_required_field:line1"]);
    expect(missing.passed).toBe(true);
    expect(missing.note).toContain("missing_required_field:line1");
  });
});

describe("checkConflictsSurfaced — Business Rule 5", () => {
  it("always passes and records the reconciliation status verbatim", () => {
    for (const status of ["match", "variation", "conflict", "not_applicable"] as const) {
      const result = checkConflictsSurfaced(status);
      expect(result.passed).toBe(true);
      expect(result.note).toContain(status);
    }
  });
});

describe("structural guardrails always self-report as passed (real enforcement is upstream)", () => {
  it("checkNoAutonomousGoldenRecordModification references the enforcement point", () => {
    const result = checkNoAutonomousGoldenRecordModification();
    expect(result.passed).toBe(true);
    expect(result.note).toContain("hookRunner.ts");
  });

  it("checkMcpAllowlistEnforced lists the approved servers", () => {
    const result = checkMcpAllowlistEnforced();
    expect(result.passed).toBe(true);
    expect(result.note).toContain("crm-mdm");
    expect(result.note).toContain("address-validation");
    expect(result.note).toContain("audit-store");
  });
});

describe("threshold constants", () => {
  it("keeps the auto threshold strictly above the floor", () => {
    expect(IDENTITY_CONFIDENCE_AUTO_THRESHOLD).toBeGreaterThan(IDENTITY_CONFIDENCE_FLOOR);
  });
});
