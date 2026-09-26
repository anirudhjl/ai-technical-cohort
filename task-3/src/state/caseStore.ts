import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type AuditEntry,
  type SourceRecord,
  type WorkflowCaseRecord,
  WorkflowCaseRecordSchema,
} from "../types/case.js";

const DATA_DIR = path.resolve(process.cwd(), "data", "cases");

// Serializes reads/writes per caseId so two concurrent updates to the same
// case can never interleave and silently drop one of them.
const locks = new Map<string, Promise<unknown>>();

async function withLock<T>(caseId: string, fn: () => Promise<T>): Promise<T> {
  const prior = locks.get(caseId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  locks.set(
    caseId,
    prior.then(() => gate),
  );
  await prior;
  try {
    return await fn();
  } finally {
    release();
  }
}

function casePath(caseId: string): string {
  return path.join(DATA_DIR, `${caseId}.json`);
}

async function ensureDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

async function readCaseFile(caseId: string): Promise<WorkflowCaseRecord | undefined> {
  try {
    const raw = await readFile(casePath(caseId), "utf-8");
    return WorkflowCaseRecordSchema.parse(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

async function writeCaseFile(record: WorkflowCaseRecord): Promise<void> {
  await ensureDir();
  await writeFile(casePath(record.caseId), JSON.stringify(record, null, 2), "utf-8");
}

export async function createCase(source: SourceRecord): Promise<WorkflowCaseRecord> {
  const now = new Date().toISOString();
  const record: WorkflowCaseRecord = {
    caseId: `case_${randomUUID()}`,
    status: "intake",
    request: {
      sourceSystem: source.sourceSystem,
      receivedAt: source.receivedAt,
      rawPayload: source,
    },
    identity: { confidence: 0, evidence: [] },
    address: { raw: source.address, validationFlags: [] },
    reconciliation: { status: "not_applicable", details: [] },
    qualityScore: { value: 0, band: "reject", ruleTrace: [] },
    guardrailChecks: [],
    auditTrail: [],
    createdAt: now,
    updatedAt: now,
  };
  await withLock(record.caseId, () => writeCaseFile(record));
  return record;
}

export async function getCase(caseId: string): Promise<WorkflowCaseRecord | undefined> {
  return readCaseFile(caseId);
}

type CasePatch = Partial<Omit<WorkflowCaseRecord, "caseId" | "auditTrail" | "createdAt">>;

export async function updateCase(
  caseId: string,
  patch: CasePatch,
): Promise<WorkflowCaseRecord> {
  return withLock(caseId, async () => {
    const existing = await readCaseFile(caseId);
    if (!existing) {
      throw new Error(`No such case: ${caseId}`);
    }
    const merged: WorkflowCaseRecord = WorkflowCaseRecordSchema.parse({
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
    await writeCaseFile(merged);
    return merged;
  });
}

export async function appendAuditEntry(
  caseId: string,
  entry: Omit<AuditEntry, "timestamp">,
): Promise<WorkflowCaseRecord> {
  return withLock(caseId, async () => {
    const existing = await readCaseFile(caseId);
    if (!existing) {
      throw new Error(`No such case: ${caseId}`);
    }
    const merged: WorkflowCaseRecord = {
      ...existing,
      auditTrail: [...existing.auditTrail, { ...entry, timestamp: new Date().toISOString() }],
      updatedAt: new Date().toISOString(),
    };
    await writeCaseFile(merged);
    return merged;
  });
}

export interface CaseFilter {
  status?: WorkflowCaseRecord["status"];
  band?: WorkflowCaseRecord["qualityScore"]["band"];
  hcpId?: string;
}

export async function listCases(filter: CaseFilter = {}): Promise<WorkflowCaseRecord[]> {
  await ensureDir();
  const files = await readdir(DATA_DIR).catch(() => [] as string[]);
  // Each file read is independent and the result is sorted below regardless
  // of completion order, so read them concurrently instead of one at a time.
  const records = await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .map(async (file) => {
        const raw = await readFile(path.join(DATA_DIR, file), "utf-8");
        return WorkflowCaseRecordSchema.parse(JSON.parse(raw));
      }),
  );
  const filtered = records.filter((r) => {
    if (filter.status && r.status !== filter.status) return false;
    if (filter.band && r.qualityScore.band !== filter.band) return false;
    if (filter.hcpId && r.identity.candidateHcpId !== filter.hcpId) return false;
    return true;
  });
  return filtered.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
