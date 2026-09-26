import { Router } from "express";
import { getMetrics, getRecentLogs } from "../../observability/logger.js";
import { requireRole } from "../middleware/rbac.js";

export const observabilityRouter = Router();
observabilityRouter.use(requireRole("data_steward"));

observabilityRouter.get("/logs", (req, res) => {
  const limit = Number(req.query.limit) || 100;
  res.json({ logs: getRecentLogs(limit), metrics: getMetrics() });
});
