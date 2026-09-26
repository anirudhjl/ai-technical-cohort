// Integration test: runs the REAL pipeline (real MCP child processes, real
// guardrail hooks, real audit writes) against the four golden fixtures in
// test/fixtures/ and asserts the resulting WorkflowCaseRecord matches each
// fixture's embedded expectedOutcome. This is deliberately not mocked —
// mocking the MCP layer would only prove the orchestrator calls mocks
// correctly, not that the real approved-tool pipeline produces the right
// business outcome.
//
// Because src/state/caseStore.ts and the MCP servers hardcode paths under
// process.cwd()/data/..., this test reads/writes the same data files the
// live demo uses. It snapshots data/seed/hcp-master.json before running and
// restores it in afterAll, and deletes any data/cases/*.json files it
// creates, so a real run leaves the demo's seed state untouched.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { runCase } from "../../src/orchestrator/orchestrator.js";
import { closeAllMcpClients } from "../../src/mcp-clients/mcpClient.js";
import { SourceRecordSchema } from "../../src/types/case.js";

const FIXTURES_DIR = path.resolve(process.cwd(), "test", "fixtures");
const MASTER_FILE = path.resolve(process.cwd(), "data", "seed", "hcp-master.json");
const CASES_DIR = path.resolve(process.cwd(), "data", "cases");

const FIXTURE_FILES = [
  "01-clean-match-auto-approve.json",
  "02-minor-variation-review.json",
  "03-low-identity-confidence.json",
  "04-address-conflict.json",
];

interface ExpectedOutcome {
  candidateHcpId?: string;
  identityConfidence?: number;
  identityConfidenceBelowFloor?: boolean;
  reconciliationStatus?: "match" | "variation" | "conflict" | "not_applicable";
  band: "auto" | "review" | "reject";
}

async function loadFixture(file: string): Promise<{ rawSource: unknown; expectedOutcome: ExpectedOutcome }> {
  const parsed = JSON.parse(await readFile(path.join(FIXTURES_DIR, file), "utf-8")) as {
    expectedOutcome: ExpectedOutcome;
    [key: string]: unknown;
  };
  const { expectedOutcome, ...rawSource } = parsed;
  return { rawSource, expectedOutcome };
}

let masterSnapshot: string;
const createdCaseIds: string[] = [];

describe("orchestrator.runCase — real pipeline against golden fixtures", () => {
  beforeAll(async () => {
    masterSnapshot = await readFile(MASTER_FILE, "utf-8");
  });

  afterAll(async () => {
    await closeAllMcpClients();
    await writeFile(MASTER_FILE, masterSnapshot, "utf-8");
    await Promise.all(createdCaseIds.map((id) => rm(path.join(CASES_DIR, `${id}.json`), { force: true })));
  });

  for (const file of FIXTURE_FILES) {
    it(
      `${file} produces the expected identity / reconciliation / quality-band outcome`,
      async () => {
        const { rawSource, expectedOutcome } = await loadFixture(file);
        const sourceRecord = SourceRecordSchema.parse(rawSource);

        const record = await runCase(sourceRecord);
        createdCaseIds.push(record.caseId);

        expect(record.identity.candidateHcpId).toBe(expectedOutcome.candidateHcpId);

        if (expectedOutcome.identityConfidenceBelowFloor) {
          expect(record.identity.confidence).toBeLessThan(0.5);
        } else if (typeof expectedOutcome.identityConfidence === "number") {
          expect(record.identity.confidence).toBeCloseTo(expectedOutcome.identityConfidence, 5);
        }

        if (expectedOutcome.reconciliationStatus) {
          expect(record.reconciliation.status).toBe(expectedOutcome.reconciliationStatus);
        }

        expect(record.qualityScore.band).toBe(expectedOutcome.band);

        // Business Rule 6 / guardrail: every case halts for human approval —
        // the confidence band changes how much scrutiny it gets, never
        // whether approval is required at all.
        expect(record.status).toBe("awaiting_approval");
        expect(record.humanApproval).toBeUndefined();
        expect(record.finalAction).toBeUndefined();
      },
      30000,
    );
  }
});
