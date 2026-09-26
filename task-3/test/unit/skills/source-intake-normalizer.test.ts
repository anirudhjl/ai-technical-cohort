import { describe, expect, it } from "vitest";
import { normalizeIntake } from "../../../src/skills/source-intake-normalizer.js";

const VALID_PAYLOAD = {
  sourceId: "src-test-001",
  sourceSystem: "crm_export",
  receivedAt: "2024-01-10T00:00:00Z",
  hcpNameRaw: "Dr. Alice Nguyen",
  npi: "1234567890",
  specialty: "Cardiology",
  address: {
    line1: "500 Medical Plaza Dr",
    line2: "Suite 200",
    city: "Austin",
    state: "TX",
    postalCode: "78701",
    country: "US",
  },
};

describe("normalizeIntake — Business Rule 1 (never trust an unverified source)", () => {
  it("parses a valid payload into a typed SourceRecord and passes the guardrail", () => {
    const { sourceRecord, guardrailCheck } = normalizeIntake(VALID_PAYLOAD);
    expect(sourceRecord.hcpNameRaw).toBe("Dr. Alice Nguyen");
    expect(guardrailCheck.passed).toBe(true);
  });

  it("rejects a payload from an unapproved source system at schema-parse time — the enum itself is the first enforcement point, before checkApprovedSource ever runs", () => {
    expect(() => normalizeIntake({ ...VALID_PAYLOAD, sourceSystem: "shadow_spreadsheet" })).toThrow();
  });

  it("throws on a structurally invalid payload rather than silently coercing it", () => {
    expect(() => normalizeIntake({ ...VALID_PAYLOAD, address: undefined })).toThrow();
  });

  it("throws when a required field is missing entirely", () => {
    const { address: _address, ...withoutAddress } = VALID_PAYLOAD;
    expect(() => normalizeIntake(withoutAddress)).toThrow();
  });
});
