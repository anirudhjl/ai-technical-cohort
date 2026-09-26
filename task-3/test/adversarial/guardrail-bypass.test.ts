// Adversarial guardrail tests. Each case is a deliberate attempt to trip one
// of the four CLAUDE.md guardrails; every attempt here must be caught by a
// real runtime check (never a mock), and none may silently succeed. Target:
// 100% catch rate across this file.
//
// Like test/unit/orchestrator.test.ts, this exercises the real MCP child
// processes and the real data/ files, so it snapshots and restores
// data/seed/hcp-master.json and cleans up any case files it creates.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { callTool, GuardrailBlockedError } from "../../src/hooks/hookRunner.js";
import { closeAllMcpClients } from "../../src/mcp-clients/mcpClient.js";
import { runCase } from "../../src/orchestrator/orchestrator.js";
import { runMasterDataAgent } from "../../src/agents/masterDataAgent.js";
import { SourceRecordSchema, type HcpMasterRecord } from "../../src/types/case.js";

const MASTER_FILE = path.resolve(process.cwd(), "data", "seed", "hcp-master.json");
const CASES_DIR = path.resolve(process.cwd(), "data", "cases");
const FIXTURE_LOW_CONFIDENCE = path.resolve(
  process.cwd(),
  "test",
  "fixtures",
  "03-low-identity-confidence.json",
);

let masterSnapshot: string;
const createdCaseIds: string[] = [];

describe("Adversarial guardrail-bypass attempts", () => {
  beforeAll(async () => {
    masterSnapshot = await readFile(MASTER_FILE, "utf-8");
  });

  afterAll(async () => {
    await closeAllMcpClients();
    await writeFile(MASTER_FILE, masterSnapshot, "utf-8");
    await Promise.all(createdCaseIds.map((id) => rm(path.join(CASES_DIR, `${id}.json`), { force: true })));
  });

  it(
    "refuses a tool call aimed at an MCP server not on the allowlist (guardrail: no access to unapproved databases)",
    async () => {
      await expect(
        callTool(
          { caseId: "case_adversarial_allowlist", agent: "adversarial-test" },
          // @ts-expect-error — deliberately bypassing the McpServerName union to
          // simulate a caller ignoring the TS constraint; the runtime allowlist
          // check must still catch it regardless of what the type system allows.
          "shadow-db",
          "dump_everything",
          {},
        ),
      ).rejects.toThrow(GuardrailBlockedError);
    },
    30000,
  );

  it(
    "refuses crm-mdm.write_hcp_address without approved:true (guardrail: no autonomous golden-record modification)",
    async () => {
      await expect(
        callTool(
          // `approved` deliberately omitted — this is the bypass attempt.
          { caseId: "case_adversarial_write", agent: "adversarial-test" },
          "crm-mdm",
          "write_hcp_address",
          {
            hcpId: "HCP-1001",
            name: "Attacker Inserted Name",
            npi: "0000000000",
            specialty: "Cardiology",
            address: { line1: "1 Fake St", city: "Nowhere", state: "ZZ", postalCode: "00000", country: "US" },
            sourceSystem: "crm_export",
            sourceTimestamp: new Date().toISOString(),
            caseId: "case_adversarial_write",
            allowCreate: false,
          },
        ),
      ).rejects.toThrow(GuardrailBlockedError);

      // Confirm the golden record was genuinely never touched, not just that
      // the promise rejected.
      const master = JSON.parse(await readFile(MASTER_FILE, "utf-8")) as HcpMasterRecord[];
      const hcp1001 = master.find((r) => r.hcpId === "HCP-1001");
      expect(hcp1001?.name).not.toBe("Attacker Inserted Name");
      expect(hcp1001?.addressHistory).toHaveLength(1);
    },
    30000,
  );

  it(
    "never reaches completed status or writes the golden record for a low-identity-confidence case without a recorded human approval",
    async () => {
      const parsed = JSON.parse(await readFile(FIXTURE_LOW_CONFIDENCE, "utf-8")) as { [key: string]: unknown };
      const { expectedOutcome: _expectedOutcome, ...rawSource } = parsed;
      const sourceRecord = SourceRecordSchema.parse(rawSource);

      const record = await runCase(sourceRecord);
      createdCaseIds.push(record.caseId);

      expect(record.status).not.toBe("completed");
      expect(record.humanApproval).toBeUndefined();
      expect(record.finalAction).toBeUndefined();

      // Even a direct attempt to run Master Data Agent on this exact
      // record — skipping the API's /approve endpoint entirely — must be
      // refused, because no human approval is recorded on the case.
      await expect(runMasterDataAgent(record)).rejects.toThrow(/no recorded human approval/i);
    },
    30000,
  );
});
