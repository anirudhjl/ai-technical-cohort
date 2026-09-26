// Source Intake Agent — tags source system + timestamp, rejects unapproved
// sources outright (CLAUDE.md Business Rules 1 & 2). See PROJECT_PREP.md §4.
import { normalizeIntake } from "../skills/source-intake-normalizer.js";
import { writeTraceStep } from "../skills/audit-trace-writer.js";
import { parseIntakeNote } from "../orchestrator/llm.js";
import { logStep } from "../observability/logger.js";
import { updateCase } from "../state/caseStore.js";
import type { WorkflowCaseRecord } from "../types/case.js";

const AGENT = "source-intake";

export async function runSourceIntakeAgent(caseRecord: WorkflowCaseRecord): Promise<WorkflowCaseRecord> {
  const start = Date.now();
  const { sourceRecord, guardrailCheck } = normalizeIntake(caseRecord.request.rawPayload);
  const noteResult = await parseIntakeNote(sourceRecord.freeTextNote);

  if (sourceRecord.freeTextNote) {
    await logStep({
      caseId: caseRecord.caseId,
      agent: AGENT,
      skill: "source-intake-normalizer",
      durationMs: Date.now() - start,
      outcome: "ok",
      modelUsed: noteResult.usedLlm ? noteResult.modelUsed : undefined,
      tokenUsage: noteResult.usedLlm ? noteResult.tokenUsage : undefined,
      note: noteResult.usedLlm ? "parsed free-text intake note via LLM" : "llm_skipped: no API key, deterministic fallback used",
    });
  }

  let updated = await updateCase(caseRecord.caseId, {
    status: guardrailCheck.passed ? "processing" : "blocked",
    guardrailChecks: [...caseRecord.guardrailChecks, guardrailCheck],
  });

  updated = await writeTraceStep({
    caseId: caseRecord.caseId,
    agent: AGENT,
    skill: "source-intake-normalizer",
    evidence:
      `Source system "${sourceRecord.sourceSystem}" received at ${sourceRecord.receivedAt}.` +
      (noteResult.text ? ` Field note: ${noteResult.text}` : ""),
    decision: guardrailCheck.passed
      ? "Source system is approved; proceeding to identity resolution."
      : `Source rejected and case blocked: ${guardrailCheck.note}`,
    maskablePayload: {
      name: sourceRecord.hcpNameRaw,
      npi: sourceRecord.npi,
      line1: sourceRecord.address.line1,
      line2: sourceRecord.address.line2,
      city: sourceRecord.address.city,
      state: sourceRecord.address.state,
      postalCode: sourceRecord.address.postalCode,
    },
  });

  return updated;
}
