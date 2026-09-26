import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const LOG_FILE = path.resolve(process.cwd(), "logs", "agent-events.log");
const MAX_BUFFER = 500;

export interface AgentStepLog {
  timestamp: string;
  caseId: string;
  agent: string;
  skill?: string;
  tool?: string;
  durationMs: number;
  outcome: "ok" | "error" | "blocked";
  modelUsed?: string;
  tokenUsage?: { inputTokens: number; outputTokens: number };
  note?: string;
}

const recentBuffer: AgentStepLog[] = [];
let dirEnsured = false;

async function ensureDir(): Promise<void> {
  if (dirEnsured) return;
  await mkdir(path.dirname(LOG_FILE), { recursive: true });
  dirEnsured = true;
}

// The Observability tab reads recentBuffer, which otherwise starts empty on
// every process restart even though logs/agent-events.log still holds real
// history on disk. Called once at server startup so the tab reflects durable
// state rather than only the current process's uptime.
export async function hydrateRecentLogsFromDisk(): Promise<void> {
  await ensureDir();
  let raw: string;
  try {
    raw = await readFile(LOG_FILE, "utf-8");
  } catch {
    return;
  }
  const lines = raw.split("\n").filter((l) => l.trim() !== "");
  const tail = lines.slice(-MAX_BUFFER);
  recentBuffer.length = 0;
  for (const line of tail) {
    try {
      recentBuffer.push(JSON.parse(line) as AgentStepLog);
    } catch {
      // skip a malformed line rather than failing startup over it
    }
  }
}

export async function logStep(entry: Omit<AgentStepLog, "timestamp">): Promise<void> {
  const full: AgentStepLog = { ...entry, timestamp: new Date().toISOString() };
  recentBuffer.push(full);
  if (recentBuffer.length > MAX_BUFFER) recentBuffer.shift();
  await ensureDir();
  await appendFile(LOG_FILE, JSON.stringify(full) + "\n", "utf-8");
}

export function getRecentLogs(limit = 100): AgentStepLog[] {
  return recentBuffer.slice(-limit).reverse();
}

export function getMetrics(): {
  totalSteps: number;
  outcomeCounts: Record<string, number>;
  avgDurationMs: number;
} {
  const totalSteps = recentBuffer.length;
  const outcomeCounts: Record<string, number> = {};
  let durationSum = 0;
  for (const e of recentBuffer) {
    outcomeCounts[e.outcome] = (outcomeCounts[e.outcome] ?? 0) + 1;
    durationSum += e.durationMs;
  }
  return {
    totalSteps,
    outcomeCounts,
    avgDurationMs: totalSteps > 0 ? Math.round(durationSum / totalSteps) : 0,
  };
}
