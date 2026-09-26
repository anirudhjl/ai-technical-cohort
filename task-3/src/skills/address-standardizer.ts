// Thin, typed wrapper around the address-validation MCP tool. Agents call
// this skill instead of talking to the MCP client/tool directly, per
// CLAUDE.md's "agents must use approved Skills rather than implementing
// duplicate logic" architecture rule.
import { callTool, type ToolCallContext } from "../hooks/hookRunner.js";
import type { RawAddress } from "../types/case.js";

export interface StandardizeResult {
  standardized: Partial<RawAddress>;
  validationFlags: string[];
  valid: boolean;
}

export async function standardizeAddress(
  ctx: Pick<ToolCallContext, "caseId" | "agent">,
  raw: RawAddress,
): Promise<StandardizeResult> {
  const result = (await callTool(
    { ...ctx, skill: "address-standardizer", noteForLog: "standardized address via address-validation MCP tool" },
    "address-validation",
    "validate_address",
    { raw },
  )) as StandardizeResult;
  return result;
}
