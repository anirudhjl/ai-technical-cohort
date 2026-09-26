// Reusable identity-resolution logic. Fetches raw candidates through the
// approved crm-mdm MCP tool (never a direct DB read) and applies fixed,
// auditable scoring rules — never an LLM guess — per CLAUDE.md rule 7
// ("agents must not infer missing HCP information without evidence").
import { callTool, type ToolCallContext } from "../hooks/hookRunner.js";
import type { HcpMasterRecord, SourceRecord } from "../types/case.js";

export interface IdentityMatchResult {
  candidateHcpId?: string;
  candidate?: HcpMasterRecord;
  confidence: number;
  evidence: string[];
}

function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[.,]/g, "")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

export async function matchIdentity(
  ctx: Pick<ToolCallContext, "caseId" | "agent">,
  source: SourceRecord,
): Promise<IdentityMatchResult> {
  const candidates = (await callTool(
    { ...ctx, skill: "identity-matcher", noteForLog: "searched crm-mdm for identity candidates" },
    "crm-mdm",
    "search_hcp_by_identity",
    { npi: source.npi, nameRaw: source.hcpNameRaw, specialty: source.specialty },
  )) as HcpMasterRecord[];

  if (candidates.length === 0) {
    return { confidence: 0, evidence: ["No candidate HCP master record found by NPI, name, or specialty."] };
  }

  if (source.npi) {
    const npiMatch = candidates.find((c) => c.npi === source.npi);
    if (npiMatch) {
      return {
        candidateHcpId: npiMatch.hcpId,
        candidate: npiMatch,
        confidence: 0.95,
        evidence: [`Exact NPI match against master record ${npiMatch.hcpId}.`],
      };
    }
  }

  const sourceTokens = tokenize(source.hcpNameRaw);
  let best: { candidate: HcpMasterRecord; confidence: number; evidence: string[] } | undefined;
  for (const candidate of candidates) {
    const candidateTokens = tokenize(candidate.name);
    const overlap = sourceTokens.filter((t) => candidateTokens.includes(t));
    const specialtyMatches =
      !!source.specialty && candidate.specialty.toLowerCase() === source.specialty.toLowerCase();

    let confidence: number;
    const evidence: string[] = [];
    if (overlap.length >= 2 && specialtyMatches) {
      confidence = 0.7;
      evidence.push(
        `Name tokens [${overlap.join(", ")}] and specialty "${candidate.specialty}" both match ${candidate.hcpId}.`,
      );
    } else if (overlap.length >= 2) {
      confidence = 0.55;
      evidence.push(`Name tokens [${overlap.join(", ")}] match ${candidate.hcpId}; specialty not confirmed.`);
    } else if (overlap.length === 1) {
      confidence = 0.3;
      evidence.push(`Only a single, weak name-token match ("${overlap[0]}") against ${candidate.hcpId}.`);
    } else {
      confidence = 0.1;
      evidence.push(`Candidate ${candidate.hcpId} returned by search but no name-token overlap found.`);
    }

    if (!best || confidence > best.confidence) {
      best = { candidate, confidence, evidence };
    }
  }

  if (!best) {
    return { confidence: 0, evidence: ["No usable candidate after scoring."] };
  }
  return {
    candidateHcpId: best.candidate.hcpId,
    candidate: best.candidate,
    confidence: best.confidence,
    evidence: best.evidence,
  };
}
