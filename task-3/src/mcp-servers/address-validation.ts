#!/usr/bin/env node
// Approved MCP server #2: deterministic address standardization/validation.
// Rules-based only — never invents a missing field (guardrail: no unsupported
// address generation). A field that is missing stays missing and is flagged.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// `\.?` before `\b` never matches through the period when it's followed by
// whitespace (no word-boundary exists between "." and " "), so it silently
// backtracks to skip the period rather than consuming it — e.g. "Ste. 200"
// became "Suite. 200" instead of "Suite 200". A lookahead for the boundary
// avoids requiring \b to hold immediately after an optionally-matched period.
const LINE_ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bste\.?(?=\s|$)/gi, "Suite"],
  [/\bapt\.?(?=\s|$)/gi, "Apartment"],
  [/\bblvd\.?(?=\s|$)/gi, "Blvd"],
  [/\bdr\.?(?=\s|$)/gi, "Dr"],
  [/\bave\.?(?=\s|$)/gi, "Ave"],
  [/\bpkwy\.?(?=\s|$)/gi, "Pkwy"],
];

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function normalizeLine(value: string | undefined): string | undefined {
  if (!value) return value;
  let out = value.trim();
  for (const [pattern, replacement] of LINE_ABBREVIATIONS) {
    out = out.replace(pattern, replacement);
  }
  return out.replace(/\s+/g, " ");
}

const AddressInput = z.object({
  line1: z.string().optional(),
  line2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
});

const server = new McpServer({ name: "address-validation", version: "1.0.0" });

server.registerTool(
  "validate_address",
  {
    title: "Validate and standardize an address",
    description:
      "Deterministic, rules-based standardization. Never fabricates a missing field — a missing required field is " +
      "reported as a flag and left absent, per CLAUDE.md guardrail 'no unsupported address generation'.",
    inputSchema: { raw: AddressInput },
  },
  async ({ raw }) => {
    const flags: string[] = [];
    const requiredFields: Array<keyof typeof raw> = ["line1", "city", "state", "postalCode"];
    for (const field of requiredFields) {
      if (!raw[field] || raw[field]!.trim() === "") {
        flags.push(`missing_required_field:${field}`);
      }
    }

    const line1 = normalizeLine(raw.line1);
    const line2 = normalizeLine(raw.line2);
    if (line1 !== raw.line1 || line2 !== raw.line2) {
      flags.push("line_abbreviation_expanded");
    }

    const city = raw.city ? titleCase(raw.city.trim()) : raw.city;

    let state = raw.state ? raw.state.trim().toUpperCase() : raw.state;
    if (state && state.length !== 2) {
      flags.push("state_format_unrecognized");
    } else if (raw.state && state !== raw.state) {
      flags.push("state_normalized_to_uppercase");
    }

    let postalCode = raw.postalCode ? raw.postalCode.replace(/[^0-9]/g, "").slice(0, 5) : raw.postalCode;
    if (postalCode && postalCode.length !== 5) {
      flags.push("postal_code_invalid");
    }

    const country = raw.country ? raw.country.trim().toUpperCase() : "US";

    const valid = flags.every((f) => !f.startsWith("missing_required_field") && f !== "postal_code_invalid");

    const standardized = { line1, line2, city, state, postalCode, country };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ standardized, validationFlags: flags, valid }),
        },
      ],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
