// HCP-facing route — read-only status lookup only, per the user's explicit
// choice (no self-service submission through this view). Returns the
// current golden address + history, plus a plain-language status of the
// HCP's own most recent case — deliberately excludes guardrail results,
// raw evidence, or any other internal pipeline detail.
import { Router } from "express";
import { callTool } from "../../hooks/hookRunner.js";
import { listCases } from "../../state/caseStore.js";
import { requireOwnHcp, requireRole } from "../middleware/rbac.js";
import type { HcpMasterRecord, WorkflowCaseRecord } from "../../types/case.js";

export const hcpRouter = Router();

function plainLanguageStatus(caseRecord: WorkflowCaseRecord | undefined): string {
  if (!caseRecord) return "No address updates are currently on file for you.";
  switch (caseRecord.status) {
    case "intake":
    case "processing":
      return "A new address update was received and is being processed.";
    case "awaiting_approval":
      return "An address update is currently under review by our Data Team.";
    case "approved":
      return "An address update was approved and is being applied.";
    case "completed":
      return "Your address was reviewed and successfully updated.";
    case "rejected":
      return `A recent address update was not approved.${caseRecord.humanApproval?.reason ? ` Reason: ${caseRecord.humanApproval.reason}` : ""}`;
    case "blocked":
      return "A recent address update could not be processed because it did not come from an approved data source.";
    default:
      return "No further status available.";
  }
}

hcpRouter.get("/:hcpId/address", requireRole("hcp"), requireOwnHcp, async (req, res) => {
  const { hcpId } = req.params;
  const master = (await callTool(
    { caseId: `hcp-view:${hcpId}`, agent: "hcp-portal", noteForLog: "HCP viewed their own golden record" },
    "crm-mdm",
    "get_hcp_master",
    { hcpId },
  )) as HcpMasterRecord | null;

  if (!master) {
    res.status(404).json({ error: "No master record found for this HCP." });
    return;
  }

  const cases = await listCases({ hcpId: req.user!.hcpId });
  const mostRecent = cases[0];

  res.json({
    hcpId: master.hcpId,
    name: master.name,
    specialty: master.specialty,
    currentAddress: master.currentAddress,
    addressHistory: master.addressHistory,
    status: plainLanguageStatus(mostRecent),
  });
});
