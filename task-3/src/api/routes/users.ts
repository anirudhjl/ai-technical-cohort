// No login screen (per user's explicit choice) — this just lists the seeded
// demo identities for the header role switcher. Actual role enforcement
// still happens server-side in rbac.ts on every other route.
import { Router } from "express";
import { attachUser, listDemoUsers } from "../middleware/rbac.js";

export const usersRouter = Router();

usersRouter.get("/", async (_req, res) => {
  const users = await listDemoUsers();
  res.json(users);
});

usersRouter.get("/me", attachUser, (req, res) => {
  res.json(req.user);
});
