// Validates and normalizes a raw source-feed payload into a typed
// SourceRecord, and checks it against the approved-source-system guardrail
// before anything downstream ever touches it (CLAUDE.md Business Rule 1:
// "Never create an HCP master record solely from an unverified source").
import { checkApprovedSource, type GuardrailCheck } from "../guardrails/rules.js";
import { SourceRecordSchema, type SourceRecord } from "../types/case.js";

export interface IntakeNormalizeResult {
  sourceRecord: SourceRecord;
  guardrailCheck: GuardrailCheck;
}

export function normalizeIntake(rawPayload: unknown): IntakeNormalizeResult {
  const sourceRecord = SourceRecordSchema.parse(rawPayload);
  const guardrailCheck = checkApprovedSource(sourceRecord.sourceSystem);
  return { sourceRecord, guardrailCheck };
}
