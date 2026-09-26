import { describe, expect, it } from "vitest";
import {
  maskAddressLine,
  maskCity,
  maskFreeText,
  maskName,
  maskNpi,
  maskPostalCode,
} from "../../../src/skills/pii-masker.js";

describe("pii-masker", () => {
  it("masks a name to first-initial tokens", () => {
    expect(maskName("Elena Petrov")).toBe("E. P.");
    expect(maskName(undefined)).toBe("");
  });

  it("masks an NPI keeping only the first two and last two digits", () => {
    expect(maskNpi("1234567890")).toBe("12******90");
    expect(maskNpi("123")).toBe("***");
    expect(maskNpi(undefined)).toBe("");
  });

  it("masks digits out of an address line", () => {
    expect(maskAddressLine("900 Harbor View Ave")).toBe("# Harbor View Ave");
    expect(maskAddressLine(undefined)).toBe("");
  });

  it("masks a postal code keeping only the first two characters", () => {
    expect(maskPostalCode("33602")).toBe("33***");
    expect(maskPostalCode(undefined)).toBe("");
  });

  it("masks a city to its first initial", () => {
    expect(maskCity("Minneapolis")).toBe("M.");
    expect(maskCity(undefined)).toBe("");
  });

  it("masks every field of a single payload embedded in free text", () => {
    const text = 'Matched "Elena Petrov" (NPI 1234567890) at 900 Harbor View Ave, Tampa, FL 33602.';
    const masked = maskFreeText(text, {
      name: "Elena Petrov",
      npi: "1234567890",
      line1: "900 Harbor View Ave",
      city: "Tampa",
      state: "FL",
      postalCode: "33602",
    });
    expect(masked).not.toContain("Elena Petrov");
    expect(masked).not.toContain("1234567890");
    expect(masked).not.toContain("Tampa");
    expect(masked).not.toContain("FL");
    expect(masked).not.toContain("33602");
    expect(masked).toContain("E. P.");
  });

  it("masks both sides of a golden-vs-incoming comparison passed as an array", () => {
    const text = 'City/state differ from the golden record: on file "Minneapolis, MN" vs incoming "Tampa, FL".';
    const masked = maskFreeText(text, [
      { city: "Tampa", state: "FL" },
      { city: "Minneapolis", state: "MN" },
    ]);
    expect(masked).not.toContain("Minneapolis");
    expect(masked).not.toContain("Tampa");
    expect(masked).not.toContain("MN");
    expect(masked).not.toContain("FL");
    expect(masked).toContain("M.");
    expect(masked).toContain("T.");
  });

  it("leaves text untouched when no payload fields are present", () => {
    const text = "No PII in this sentence.";
    expect(maskFreeText(text, {})).toBe(text);
  });
});
