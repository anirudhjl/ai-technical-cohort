// Runtime "hooks" layer: every MCP tool call in this codebase must go
// through callTool() below. It implements the same PreToolUse / PostToolUse
// pattern Claude Code hooks use, but at agent runtime instead of dev time:
//   PreToolUse  -> MCP allowlist check, block ungoverned golden-record writes
//   (tool call)
//   PostToolUse -> structured, PII-safe observability log line
// See .claude/settings.json + .claude/hooks/ for the companion dev-time
// Claude Code hooks (test-on-change), which are a separate mechanism.
import { APPROVED_MCP_SERVERS, callMcpTool, type McpServerName } from "../mcp-clients/mcpClient.js";
import { logStep } from "../observability/logger.js";

export class GuardrailBlockedError extends Error {}

export interface ToolCallContext {
  caseId: string;
  agent: string;
  skill?: string;
  /** Must be true to permit a crm-mdm write_hcp_address call. */
  approved?: boolean;
  /** Pre-masked (via pii-masker), safe-to-log summary of what this call did. */
  noteForLog?: string;
}

export async function callTool(
  ctx: ToolCallContext,
  serverName: McpServerName,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const start = Date.now();

  // PreToolUse #1 — allowlist. Runtime check, not just a TS type constraint,
  // so it still fires if a caller bypasses the type system (see the
  // adversarial guardrail tests).
  if (!(APPROVED_MCP_SERVERS as readonly string[]).includes(serverName)) {
    await logStep({
      caseId: ctx.caseId,
      agent: ctx.agent,
      skill: ctx.skill,
      tool: `${serverName}.${toolName}`,
      durationMs: Date.now() - start,
      outcome: "blocked",
      note: "blocked by PreToolUse hook: MCP server not in allowlist",
    });
    throw new GuardrailBlockedError(`MCP server "${serverName}" is not an approved server.`);
  }

  // PreToolUse #2 — no autonomous golden-record modification. A write to the
  // HCP master can only happen once a human approval is recorded on the
  // case, with no exception for high-confidence "auto" band cases.
  if (serverName === "crm-mdm" && toolName === "write_hcp_address" && ctx.approved !== true) {
    await logStep({
      caseId: ctx.caseId,
      agent: ctx.agent,
      skill: ctx.skill,
      tool: `${serverName}.${toolName}`,
      durationMs: Date.now() - start,
      outcome: "blocked",
      note: "blocked by PreToolUse hook: golden-record write attempted without human approval",
    });
    throw new GuardrailBlockedError(
      "Refused to write the HCP master record: no human approval recorded on this case.",
    );
  }

  try {
    const result = await callMcpTool(serverName, toolName, args);
    await logStep({
      caseId: ctx.caseId,
      agent: ctx.agent,
      skill: ctx.skill,
      tool: `${serverName}.${toolName}`,
      durationMs: Date.now() - start,
      outcome: "ok",
      note: ctx.noteForLog,
    });
    return result;
  } catch (err) {
    if (err instanceof GuardrailBlockedError) throw err;
    await logStep({
      caseId: ctx.caseId,
      agent: ctx.agent,
      skill: ctx.skill,
      tool: `${serverName}.${toolName}`,
      durationMs: Date.now() - start,
      outcome: "error",
      note: (err as Error).message,
    });
    throw err;
  }
}
