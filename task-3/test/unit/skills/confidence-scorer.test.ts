import { describe, expect, it } from "vitest";
import { scoreQuality } from "../../../src/skills/confidence-scorer.js";

describe("scoreQuality — Business Rule 4 (deterministic, rules-based)", () => {
  it("bands 'reject' outright for an unapproved source system, regardless of everything else", () => {
    const result = scoreQuality({
      // @ts-expect-error deliberately invalid to prove the guardrail fires
      sourceSystem: "shadow_spreadsheet",
      identityConfidence: 1,
      reconciliationStatus: "match",
      addressValid: true,
    });
    expect(result.band).toBe("reject");
    expect(result.value).toBe(0);
    expect(result.ruleTrace[0]).toContain("reject");
  });

  it("bands 'auto' only for high identity confidence + exact match + valid address", () => {
    const result = scoreQuality({
      sourceSystem: "crm_export",
      identityConfidence: 0.95,
      reconciliationStatus: "match",
      addressValid: true,
    });
    expect(result.band).toBe("auto");
  });

  it("never auto-approves a conflict, even at maximum identity confidence", () => {
    const result = scoreQuality({
      sourceSystem: "crm_export",
      identityConfidence: 1,
      reconciliationStatus: "conflict",
      addressValid: true,
    });
    expect(result.band).toBe("review");
    expect(result.ruleTrace.join(" ")).toContain("conflict");
  });

  it("never auto-approves a variation", () => {
    const result = scoreQuality({
      sourceSystem: "crm_export",
      identityConfidence: 1,
      reconciliationStatus: "variation",
      addressValid: true,
    });
    expect(result.band).toBe("review");
  });

  it("routes to review when identity confidence is below the floor", () => {
    const result = scoreQuality({
      sourceSystem: "crm_export",
      identityConfidence: 0.3,
      reconciliationStatus: "not_applicable",
      addressValid: true,
    });
    expect(result.band).toBe("review");
    expect(result.ruleTrace.join(" ")).toContain("floor");
  });

  it("routes to review when the address failed validation", () => {
    const result = scoreQuality({
      sourceSystem: "crm_export",
      identityConfidence: 0.95,
      reconciliationStatus: "match",
      addressValid: false,
    });
    expect(result.band).toBe("review");
  });

  it("routes to review for a below-auto-threshold identity confidence even on a match", () => {
    const result = scoreQuality({
      sourceSystem: "crm_export",
      identityConfidence: 0.7,
      reconciliationStatus: "match",
      addressValid: true,
    });
    expect(result.band).toBe("review");
  });
});
