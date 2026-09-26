// The only two places in this codebase that may call a real LLM (per
// CLAUDE.md Business Rule 7 — no inference without evidence — everything
// else is deterministic rules/code). Both fall back to a deterministic
// template when ANTHROPIC_API_KEY is absent, so the demo runs with zero
// secrets configured, and both report whether the fallback fired so the
// caller can log it rather than silently pretending an LLM ran.
import Anthropic from "@anthropic-ai/sdk";
import type { WorkflowCaseRecord } from "../types/case.js";

const MODEL = "claude-haiku-4-5-20251001";

let cachedClient: Anthropic | undefined;
function getClient(): Anthropic | undefined {
  if (!process.env.ANTHROPIC_API_KEY) return undefined;
  if (!cachedClient) cachedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return cachedClient;
}

export interface LlmResult {
  text: string;
  usedLlm: boolean;
  modelUsed?: string;
  tokenUsage?: { inputTokens: number; outputTokens: number };
}

export async function parseIntakeNote(freeTextNote: string | undefined): Promise<LlmResult> {
  if (!freeTextNote || freeTextNote.trim() === "") {
    return { text: "", usedLlm: false };
  }
  const client = getClient();
  if (!client) {
    return { text: freeTextNote.trim(), usedLlm: false };
  }
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content:
          "Extract only the factual details already present in this free-text field-rep note that are " +
          "relevant to an HCP address update. Do not add, guess, or infer anything not literally stated. " +
          "Reply with a concise plain-text summary only, no preamble.\n\n" +
          freeTextNote,
      },
    ],
  });
  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter((t) => t !== "")
    .join("\n")
    .trim();
  return {
    text: text || freeTextNote.trim(),
    usedLlm: true,
    modelUsed: response.model,
    tokenUsage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}

function deterministicApprovalSummary(caseRecord: WorkflowCaseRecord): string {
  const { identity, address, reconciliation, qualityScore } = caseRecord;
  const idLine = identity.candidateHcpId
    ? `Matched to ${identity.candidateHcpId} at confidence ${identity.confidence.toFixed(2)}.`
    : `No confident HCP match found (confidence ${identity.confidence.toFixed(2)}).`;
  const addrLine = address.standardized
    ? `Standardized address: ${address.standardized.line1}, ${address.standardized.city}, ${address.standardized.state} ${address.standardized.postalCode}.`
    : "Address could not be fully standardized.";
  const flagsLine = address.validationFlags.length
    ? `Validation flags: ${address.validationFlags.join(", ")}.`
    : "No validation flags.";
  const reconLine = `Reconciliation vs. golden record: ${reconciliation.status} (${reconciliation.details.join("; ") || "no further detail"}).`;
  const bandLine = `Quality band: ${qualityScore.band} (score ${qualityScore.value.toFixed(2)}).`;
  return [idLine, addrLine, flagsLine, reconLine, bandLine].join(" ");
}

export async function writeApprovalSummary(caseRecord: WorkflowCaseRecord): Promise<LlmResult> {
  const fallback = deterministicApprovalSummary(caseRecord);
  const client = getClient();
  if (!client) {
    return { text: fallback, usedLlm: false };
  }
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content:
          "Write a short, plain-language summary for a Data Steward who must approve or reject an HCP address " +
          "change. Base it ONLY on the structured evidence below — do not add any fact not present in it. " +
          "2-4 sentences, no headers, no markdown.\n\n" +
          JSON.stringify(
            {
              identity: caseRecord.identity,
              address: caseRecord.address,
              reconciliation: caseRecord.reconciliation,
              qualityScore: caseRecord.qualityScore,
              guardrailChecks: caseRecord.guardrailChecks,
            },
            null,
            2,
          ),
      },
    ],
  });
  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter((t) => t !== "")
    .join("\n")
    .trim();
  return {
    text: text || fallback,
    usedLlm: true,
    modelUsed: response.model,
    tokenUsage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}
