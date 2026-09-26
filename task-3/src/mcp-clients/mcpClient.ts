// Low-level MCP transport layer: spawns each approved MCP server as a child
// process over stdio and exposes one generic `callMcpTool`. Nothing above
// this layer should talk to an MCP server any other way. This module has no
// knowledge of guardrails/hooks on purpose — that enforcement lives one layer
// up in src/hooks/hookRunner.ts, so it can never accidentally be bypassed by
// a caller that imports this file directly instead of the hooked entry point.
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export const APPROVED_MCP_SERVERS = ["crm-mdm", "address-validation", "audit-store"] as const;
export type McpServerName = (typeof APPROVED_MCP_SERVERS)[number];

const SERVER_ENTRYPOINTS: Record<McpServerName, string> = {
  "crm-mdm": path.resolve(process.cwd(), "src/mcp-servers/crm-mdm.ts"),
  "address-validation": path.resolve(process.cwd(), "src/mcp-servers/address-validation.ts"),
  "audit-store": path.resolve(process.cwd(), "src/mcp-servers/audit-store.ts"),
};

const TSX_BIN = path.resolve(process.cwd(), "node_modules", ".bin", "tsx");

const clients = new Map<McpServerName, Promise<Client>>();

async function connect(serverName: McpServerName): Promise<Client> {
  const transport = new StdioClientTransport({
    command: TSX_BIN,
    args: [SERVER_ENTRYPOINTS[serverName]],
  });
  const client = new Client({ name: `orchestrator-${serverName}-client`, version: "1.0.0" });
  await client.connect(transport);
  return client;
}

function getClient(serverName: McpServerName): Promise<Client> {
  let pending = clients.get(serverName);
  if (!pending) {
    pending = connect(serverName);
    clients.set(serverName, pending);
  }
  return pending;
}

export async function callMcpTool(
  serverName: McpServerName,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const client = await getClient(serverName);
  const result = await client.callTool({ name: toolName, arguments: args });
  const first = Array.isArray(result.content) ? result.content[0] : undefined;
  const text = first && "text" in first ? (first.text as string) : "null";
  if (result.isError) {
    throw new Error(`MCP tool error [${serverName}.${toolName}]: ${text}`);
  }
  return JSON.parse(text);
}

export async function closeAllMcpClients(): Promise<void> {
  for (const pending of clients.values()) {
    const client = await pending;
    await client.close();
  }
  clients.clear();
}
