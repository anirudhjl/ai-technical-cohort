// Deterministic, rules-based confidence scoring — CLAUDE.md Business Rule 4
// ("Address confidence must be calculated using defined validation rules")
// and Business Rule 7 (no inference without evidence: every band decision
// traces back to a named, testable rule, never a model guess).
import {
  checkApprovedSource,
  IDENTITY_CONFIDENCE_AUTO_THRESHOLD,
  IDENTITY_CONFIDENCE_FLOOR,
} from "../guardrails/rules.js";
import type { QualityScoreSchema, ReconciliationSchema, SourceSystem } from "../types/case.js";
import { z } from "zod";

type QualityScore = z.infer<typeof QualityScoreSchema>;
type ReconciliationStatus = z.infer<typeof ReconciliationSchema>["status"];

export interface ScoreInput {
  sourceSystem: SourceSystem;
  identityConfidence: number;
  reconciliationStatus: ReconciliationStatus;
  addressValid: boolean;
}

const RECONCILIATION_WEIGHT: Record<ReconciliationStatus, number> = {
  match: 1,
  variation: 0.6,
  conflict: 0.2,
  not_applicable: 0.8,
};

export function scoreQuality(input: ScoreInput): QualityScore {
  const ruleTrace: string[] = [];

  const sourceCheck = checkApprovedSource(input.sourceSystem);
  if (!sourceCheck.passed) {
    ruleTrace.push(`reject: ${sourceCheck.note}`);
    return { value: 0, band: "reject", ruleTrace };
  }

  const addressWeight = input.addressValid ? 1 : 0.3;
  const reconciliationWeight = RECONCILIATION_WEIGHT[input.reconciliationStatus];
  const value =
    input.identityConfidence * 0.6 + addressWeight * 0.2 + reconciliationWeight * 0.2;

  if (input.reconciliationStatus === "conflict") {
    ruleTrace.push("review: reconciliation status is 'conflict' — surfaced for human review, never auto-resolved.");
    return { value, band: "review", ruleTrace };
  }
  if (input.reconciliationStatus === "variation") {
    ruleTrace.push("review: reconciliation status is 'variation' — surfaced for human review rather than silently applied.");
    return { value, band: "review", ruleTrace };
  }
  if (input.identityConfidence < IDENTITY_CONFIDENCE_FLOOR) {
    ruleTrace.push(
      `review: identity confidence ${input.identityConfidence.toFixed(2)} is below the ${IDENTITY_CONFIDENCE_FLOOR} floor.`,
    );
    return { value, band: "review", ruleTrace };
  }
  if (!input.addressValid) {
    ruleTrace.push("review: standardized address failed validation (missing or malformed required field).");
    return { value, band: "review", ruleTrace };
  }
  if (
    input.identityConfidence >= IDENTITY_CONFIDENCE_AUTO_THRESHOLD &&
    input.reconciliationStatus === "match"
  ) {
    ruleTrace.push(
      `auto: identity confidence ${input.identityConfidence.toFixed(2)} meets the ${IDENTITY_CONFIDENCE_AUTO_THRESHOLD} auto threshold and address matches the golden record exactly (after standardization).`,
    );
    return { value, band: "auto", ruleTrace };
  }

  ruleTrace.push("review: did not meet the auto-approval bar; defaulting to human review.");
  return { value, band: "review", ruleTrace };
}
