import path from "node:path";
import cors from "cors";
import express from "express";
import { attachUser } from "./middleware/rbac.js";
import { usersRouter } from "./routes/users.js";
import { hcpRouter } from "./routes/hcp.js";
import { casesRouter } from "./routes/cases.js";
import { observabilityRouter } from "./routes/observability.js";
import { hydrateRecentLogsFromDisk } from "../observability/logger.js";

// No dotenv dependency needed: Node 20.6+ can load a .env file itself. A
// missing .env is expected and fine — ANTHROPIC_API_KEY-gated LLM steps
// (see src/orchestrator/llm.ts) simply fall back to deterministic templates.
try {
  process.loadEnvFile(path.resolve(process.cwd(), ".env"));
} catch {
  // no .env present
}

const PORT = Number(process.env.PORT) || 4000;

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// GET /api/users itself is reachable with no identity yet (it populates the
// header role switcher in the first place); /api/users/me attaches its own.
app.use("/api/users", usersRouter);
app.use("/api/hcp", attachUser, hcpRouter);
app.use("/api/cases", attachUser, casesRouter);
app.use("/api/observability", attachUser, observabilityRouter);

await hydrateRecentLogsFromDisk();

app.listen(PORT, () => {
  console.log(JSON.stringify({ level: "info", msg: `API listening on http://localhost:${PORT}` }));
});
