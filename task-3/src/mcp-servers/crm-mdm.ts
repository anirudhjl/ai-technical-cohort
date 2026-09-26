#!/usr/bin/env node
// Approved MCP server #1: CRM/MDM read + append-only write of the HCP golden
// record. This is the ONLY module in the codebase allowed to touch
// data/seed/hcp-master.json — every other part of the system (including the
// orchestrator) must go through these tools, per CLAUDE.md ("External
// systems must be accessed through approved MCP tools").
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { HcpMasterRecordSchema, type HcpMasterRecord } from "../types/case.js";

const DATA_FILE = path.resolve(process.cwd(), "data", "seed", "hcp-master.json");

// In-memory cache: safe only because this module is the sole writer of
// DATA_FILE (see header comment above) and runs as one long-lived process
// for the life of the demo session, so nothing else can change the file
// out from under this cache between requests.
let cache: HcpMasterRecord[] | null = null;

async function loadAll(): Promise<HcpMasterRecord[]> {
  if (!cache) {
    const raw = await readFile(DATA_FILE, "utf-8");
    cache = z.array(HcpMasterRecordSchema).parse(JSON.parse(raw));
  }
  return cache;
}

async function saveAll(records: HcpMasterRecord[]): Promise<void> {
  cache = records;
  await writeFile(DATA_FILE, JSON.stringify(records, null, 2), "utf-8");
}

const server = new McpServer({ name: "crm-mdm", version: "1.0.0" });

server.registerTool(
  "get_hcp_master",
  {
    title: "Get HCP master record",
    description: "Reads the current golden record for one HCP by hcpId, including address version history.",
    inputSchema: { hcpId: z.string() },
  },
  async ({ hcpId }) => {
    const records = await loadAll();
    const found = records.find((r) => r.hcpId === hcpId) ?? null;
    return { content: [{ type: "text", text: JSON.stringify(found) }] };
  },
);

server.registerTool(
  "search_hcp_by_identity",
  {
    title: "Search HCP master by identity attributes",
    description:
      "Returns raw candidate HCP master records matching on NPI and/or name/specialty. Does not score confidence " +
      "— that is computed by the Identity Resolution agent's own rules, per CLAUDE.md rule 7 (no inference without evidence).",
    inputSchema: {
      npi: z.string().optional(),
      nameRaw: z.string().optional(),
      specialty: z.string().optional(),
    },
  },
  async ({ npi, nameRaw, specialty }) => {
    const records = await loadAll();
    const candidates = records.filter((r) => {
      if (npi && r.npi === npi) return true;
      if (nameRaw) {
        const tokens = nameRaw.toLowerCase().replace(/[.,]/g, "").split(/\s+/).filter(Boolean);
        const nameLower = r.name.toLowerCase();
        const anyTokenMatches = tokens.some((t) => t.length > 1 && nameLower.includes(t));
        if (anyTokenMatches) return true;
      }
      if (specialty && r.specialty.toLowerCase() === specialty.toLowerCase()) return true;
      return false;
    });
    return { content: [{ type: "text", text: JSON.stringify(candidates) }] };
  },
);

server.registerTool(
  "write_hcp_address",
  {
    title: "Write HCP address (append-only)",
    description:
      "Appends a new address version to an existing HCP's history and updates the current address. Never overwrites " +
      "history (CLAUDE.md rule 3). Can only create a brand-new HCP master record when allowCreate=true, which callers " +
      "must only set after human approval (CLAUDE.md rule 1 + guardrail: no autonomous golden-record modification).",
    inputSchema: {
      hcpId: z.string(),
      name: z.string(),
      npi: z.string(),
      specialty: z.string(),
      address: z.object({
        line1: z.string(),
        line2: z.string().optional(),
        city: z.string(),
        state: z.string(),
        postalCode: z.string(),
        country: z.string(),
      }),
      sourceSystem: z.string(),
      sourceTimestamp: z.string(),
      caseId: z.string(),
      allowCreate: z.boolean().default(false),
    },
  },
  async ({ hcpId, name, npi, specialty, address, sourceSystem, sourceTimestamp, caseId, allowCreate }) => {
    const records = await loadAll();
    const idx = records.findIndex((r) => r.hcpId === hcpId);
    const now = new Date().toISOString();

    if (idx === -1) {
      if (!allowCreate) {
        return {
          isError: true,
          content: [{ type: "text", text: `No existing HCP master record for ${hcpId} and allowCreate=false.` }],
        };
      }
      const created: HcpMasterRecord = {
        hcpId,
        name,
        npi,
        specialty,
        currentAddress: address,
        addressHistory: [
          {
            address,
            sourceSystem: sourceSystem as HcpMasterRecord["addressHistory"][number]["sourceSystem"],
            sourceTimestamp,
            recordedAt: now,
            caseId,
            version: 1,
          },
        ],
      };
      records.push(created);
      await saveAll(records);
      return { content: [{ type: "text", text: JSON.stringify(created) }] };
    }

    const existing = records[idx]!;
    const nextVersion = existing.addressHistory.length + 1;
    const updated: HcpMasterRecord = {
      ...existing,
      currentAddress: address,
      addressHistory: [
        ...existing.addressHistory,
        {
          address,
          sourceSystem: sourceSystem as HcpMasterRecord["addressHistory"][number]["sourceSystem"],
          sourceTimestamp,
          recordedAt: now,
          caseId,
          version: nextVersion,
        },
      ],
    };
    records[idx] = updated;
    await saveAll(records);
    return { content: [{ type: "text", text: JSON.stringify(updated) }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
