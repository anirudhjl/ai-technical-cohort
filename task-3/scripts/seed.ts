#!/usr/bin/env node
// Idempotent seed script. Writes each seed/sample file only if it does not
// already exist, so re-running this on a working demo never clobbers live
// state — it only fills in what a fresh clone is missing. This is also the
// canonical source of the "clean" baseline: version-1-only address history
// for every golden HCP record (CLAUDE.md Business Rule 3 — never overwrite
// without retaining history — starts from a single, honest first version).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { HcpMasterRecord } from "../src/types/case.js";
import type { DemoUser } from "../src/types/user.js";

const ROOT = process.cwd();

const USERS: DemoUser[] = [
  { id: "hcp_1001", name: "Dr. Alice Nguyen", role: "hcp", hcpId: "HCP-1001" },
  { id: "hcp_1002", name: "Dr. Marcus Webb", role: "hcp", hcpId: "HCP-1002" },
  { id: "steward_1", name: "Priya Raman", role: "data_steward" },
];

const HCP_MASTER: HcpMasterRecord[] = [
  {
    hcpId: "HCP-1001",
    name: "Alice Nguyen",
    npi: "1234567890",
    specialty: "Cardiology",
    currentAddress: {
      line1: "500 Medical Plaza Dr",
      line2: "Suite 200",
      city: "Austin",
      state: "TX",
      postalCode: "78701",
      country: "US",
    },
    addressHistory: [
      {
        address: {
          line1: "500 Medical Plaza Dr",
          line2: "Suite 200",
          city: "Austin",
          state: "TX",
          postalCode: "78701",
          country: "US",
        },
        sourceSystem: "crm_export",
        sourceTimestamp: "2024-01-10T00:00:00Z",
        recordedAt: "2024-01-12T09:00:00Z",
        version: 1,
      },
    ],
  },
  {
    hcpId: "HCP-1002",
    name: "Marcus Webb",
    npi: "9876543210",
    specialty: "Oncology",
    currentAddress: {
      line1: "77 Riverside Pkwy",
      city: "Denver",
      state: "CO",
      postalCode: "80202",
      country: "US",
    },
    addressHistory: [
      {
        address: {
          line1: "77 Riverside Pkwy",
          city: "Denver",
          state: "CO",
          postalCode: "80202",
          country: "US",
        },
        sourceSystem: "onekey_feed",
        sourceTimestamp: "2023-11-02T00:00:00Z",
        recordedAt: "2023-11-05T14:30:00Z",
        version: 1,
      },
    ],
  },
  {
    hcpId: "HCP-1003",
    name: "Elena Petrov",
    npi: "4567891230",
    specialty: "Endocrinology",
    currentAddress: {
      line1: "12 Lakeside Medical Ctr",
      city: "Minneapolis",
      state: "MN",
      postalCode: "55401",
      country: "US",
    },
    addressHistory: [
      {
        address: {
          line1: "12 Lakeside Medical Ctr",
          city: "Minneapolis",
          state: "MN",
          postalCode: "55401",
          country: "US",
        },
        sourceSystem: "license_board",
        sourceTimestamp: "2023-06-01T00:00:00Z",
        recordedAt: "2023-06-03T10:00:00Z",
        version: 1,
      },
    ],
  },
];

const SAMPLE_SOURCES: Record<string, unknown> = {
  "01-clean-match-auto-approve.json": {
    sourceId: "src_crm_20240301_001",
    sourceSystem: "crm_export",
    receivedAt: "2024-03-01T08:15:00Z",
    hcpNameRaw: "Alice Nguyen, MD",
    npi: "1234567890",
    specialty: "Cardiology",
    address: {
      line1: "500 Medical Plaza Dr",
      line2: "Ste. 200",
      city: "Austin",
      state: "tx",
      postalCode: "78701",
      country: "US",
    },
  },
  "02-minor-variation-review.json": {
    sourceId: "src_onekey_20240302_014",
    sourceSystem: "onekey_feed",
    receivedAt: "2024-03-02T11:40:00Z",
    hcpNameRaw: "Marcus Webb",
    npi: "9876543210",
    specialty: "Oncology",
    address: {
      line1: "77 Riverside Pkwy",
      line2: "Suite 410",
      city: "Denver",
      state: "CO",
      postalCode: "80202",
      country: "US",
    },
  },
  "03-low-identity-confidence.json": {
    sourceId: "src_licboard_20240303_007",
    sourceSystem: "license_board",
    receivedAt: "2024-03-03T16:00:00Z",
    hcpNameRaw: "E. Petrov",
    address: {
      line1: "900 Harbor View Ave",
      city: "Tampa",
      state: "FL",
      postalCode: "33602",
      country: "US",
    },
    freeTextNote: "License board renewal filing lists a Florida practice address; no NPI provided on the filing.",
  },
  "04-address-conflict.json": {
    sourceId: "src_repform_20240304_022",
    sourceSystem: "rep_form",
    receivedAt: "2024-03-04T09:20:00Z",
    hcpNameRaw: "Elena Petrov",
    npi: "4567891230",
    specialty: "Endocrinology",
    address: {
      line1: "2200 Biscayne Health Pavilion",
      city: "Miami",
      state: "FL",
      postalCode: "33137",
      country: "US",
    },
    freeTextNote: "Field rep visited a new Miami office this week and says Dr. Petrov relocated her practice from Minneapolis.",
  },
};

async function exists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeIfMissing(filePath: string, content: unknown): Promise<void> {
  if (await exists(filePath)) {
    console.log(`  skip (already exists): ${path.relative(ROOT, filePath)}`);
    return;
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(content, null, 2) + "\n", "utf-8");
  console.log(`  wrote: ${path.relative(ROOT, filePath)}`);
}

async function main(): Promise<void> {
  console.log("Seeding data/ (idempotent — only writes files that don't already exist)...");

  await writeIfMissing(path.join(ROOT, "data", "seed", "users.json"), USERS);
  await writeIfMissing(path.join(ROOT, "data", "seed", "hcp-master.json"), HCP_MASTER);

  for (const [name, content] of Object.entries(SAMPLE_SOURCES)) {
    await writeIfMissing(path.join(ROOT, "data", "sample-sources", name), content);
  }

  // Ensure the runtime-generated directories exist even in a brand-new
  // clone, so the API and MCP servers never fail on a missing directory.
  await mkdir(path.join(ROOT, "data", "cases"), { recursive: true });
  await mkdir(path.join(ROOT, "data", "audit"), { recursive: true });
  await mkdir(path.join(ROOT, "logs"), { recursive: true });

  console.log("Seed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
