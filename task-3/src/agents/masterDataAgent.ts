// Master Data Agent — the ONLY agent with write access to the golden HCP
// record. Refuses to run unless a human approval is already recorded on the
// case (CLAUDE.md Business Rule 3 + guardrail: no autonomous golden-record
// modification), and always appends a new history version rather than
// overwriting (enforced by the crm-mdm MCP server itself).
import { randomUUID } from "node:crypto";
import { callTool } from "../hooks/hookRunner.js";
import { writeTraceStep } from "../skills/audit-trace-writer.js";
import { updateCase } from "../state/caseStore.js";
import type { HcpMasterRecord, WorkflowCaseRecord } from "../types/case.js";

const AGENT = "master-data";

export async function runMasterDataAgent(caseRecord: WorkflowCaseRecord): Promise<WorkflowCaseRecord> {
  if (caseRecord.humanApproval?.status !== "approved") {
    throw new Error(`Case ${caseRecord.caseId} has no recorded human approval; Master Data Agent refuses to run.`);
  }
  const address = caseRecord.address.standardized;
  if (!address) {
    throw new Error(`Case ${caseRecord.caseId} has no fully standardized address to apply.`);
  }

  const source = caseRecord.request.rawPayload;
  const isCreate = !caseRecord.identity.candidateHcpId;
  const hcpId = caseRecord.identity.candidateHcpId ?? `HCP-${randomUUID().split("-")[0]!.toUpperCase()}`;

  const written = (await callTool(
    {
      caseId: caseRecord.caseId,
      agent: AGENT,
      approved: true,
      noteForLog: "wrote HCP address to golden record",
    },
    "crm-mdm",
    "write_hcp_address",
    {
      hcpId,
      name: source.hcpNameRaw,
      npi: source.npi ?? "",
      specialty: source.specialty ?? "",
      address,
      sourceSystem: source.sourceSystem,
      sourceTimestamp: source.receivedAt,
      caseId: caseRecord.caseId,
      allowCreate: isCreate,
    },
  )) as HcpMasterRecord;

  const newVersion = written.addressHistory.at(-1)?.version ?? written.addressHistory.length;
  const actionType = isCreate ? "create_master_record" : "update_address";

  let updated = await updateCase(caseRecord.caseId, {
    status: "completed",
    finalAction: {
      type: actionType,
      appliedAt: new Date().toISOString(),
      masterRecordVersion: String(newVersion),
    },
  });

  updated = await writeTraceStep({
    caseId: caseRecord.caseId,
    agent: AGENT,
    skill: "audit-trace-writer",
    tool: "crm-mdm.write_hcp_address",
    evidence: `${isCreate ? "Created" : "Updated"} HCP master record ${hcpId}; address history now at version ${newVersion}.`,
    decision: `Final action "${actionType}" applied per Data Steward approval.`,
    maskablePayload: {
      name: source.hcpNameRaw,
      npi: source.npi,
      line1: address.line1,
      line2: address.line2,
      postalCode: address.postalCode,
    },
  });

  return updated;
}
