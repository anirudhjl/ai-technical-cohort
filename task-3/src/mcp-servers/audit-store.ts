#!/usr/bin/env node
// Approved MCP server #3: append-only audit ledger. This is a separate,
// independent copy of every audit entry from the mutable per-case JSON state
// — even a bug in the orchestrator's own case file can't rewrite history
// here, since this file is only ever appended to, never rewritten in place.
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const LEDGER_FILE = path.resolve(process.cwd(), "data", "audit", "audit-log.jsonl");

// The directory can't disappear once this process has created it, so only
// actually hit the filesystem for this on the first call per process
// instead of on every single append/read.
let dirEnsured = false;

async function ensureFile(): Promise<void> {
  if (dirEnsured) return;
  await mkdir(path.dirname(LEDGER_FILE), { recursive: true });
  dirEnsured = true;
}

const server = new McpServer({ name: "audit-store", version: "1.0.0" });

server.registerTool(
  "append_audit_entry",
  {
    title: "Append an audit entry (append-only)",
    description: "Writes one immutable audit-trail line to the append-only ledger. Never edits or deletes prior entries.",
    inputSchema: {
      caseId: z.string(),
      timestamp: z.string(),
      agent: z.string(),
      skill: z.string().optional(),
      tool: z.string().optional(),
      evidence: z.string().optional(),
      decision: z.string(),
    },
  },
  async (entry) => {
    await ensureFile();
    await appendFile(LEDGER_FILE, JSON.stringify(entry) + "\n", "utf-8");
    return { content: [{ type: "text", text: JSON.stringify({ ok: true }) }] };
  },
);

server.registerTool(
  "get_audit_trail",
  {
    title: "Read the ledger for one case",
    description: "Returns every ledger entry recorded for a given caseId, in append order.",
    inputSchema: { caseId: z.string() },
  },
  async ({ caseId }) => {
    await ensureFile();
    const raw = await readFile(LEDGER_FILE, "utf-8").catch(() => "");
    const entries = raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((e) => e.caseId === caseId);
    return { content: [{ type: "text", text: JSON.stringify(entries) }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
