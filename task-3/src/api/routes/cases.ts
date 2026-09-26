// Data Steward routes: the case queue, per-case detail (evidence + guardrail
// results + audit trail), and the mandatory approve/reject decision point.
import { Router } from "express";
import { z } from "zod";
import { getCase, listCases } from "../../state/caseStore.js";
import { ingestNextCase, recordHumanApproval } from "../../orchestrator/orchestrator.js";
import { requireRole } from "../middleware/rbac.js";
import { CaseStatusSchema, QualityScoreSchema, RawAddressSchema } from "../../types/case.js";

export const casesRouter = Router();
casesRouter.use(requireRole("data_steward"));

const BandSchema = QualityScoreSchema.shape.band;

casesRouter.get("/", async (req, res) => {
  const status = CaseStatusSchema.safeParse(req.query.status);
  const band = BandSchema.safeParse(req.query.band);
  const cases = await listCases({
    status: status.success ? status.data : undefined,
    band: band.success ? band.data : undefined,
  });
  res.json(cases);
});

casesRouter.post("/ingest", async (_req, res) => {
  try {
    const record = await ingestNextCase();
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

casesRouter.get("/:id", async (req, res) => {
  const record = await getCase(req.params.id!);
  if (!record) {
    res.status(404).json({ error: "No such case." });
    return;
  }
  res.json(record);
});

const DecisionBodySchema = z.object({
  reason: z.string().min(1, "A reason is required."),
  editedAddress: RawAddressSchema.optional(),
});

casesRouter.post("/:id/approve", async (req, res) => {
  const parsed = DecisionBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const record = await recordHumanApproval({
      caseId: req.params.id!,
      decision: "approved",
      approver: req.user!,
      reason: parsed.data.reason,
      editedAddress: parsed.data.editedAddress,
    });
    res.json(record);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

casesRouter.post("/:id/reject", async (req, res) => {
  const parsed = DecisionBodySchema.pick({ reason: true }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const record = await recordHumanApproval({
      caseId: req.params.id!,
      decision: "rejected",
      approver: req.user!,
      reason: parsed.data.reason,
    });
    res.json(record);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});
