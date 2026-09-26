// Server-side RBAC. There is no login screen (per the user's explicit
// choice) — the client sends a seeded x-demo-user-id header, but the ROLE
// is always resolved here, server-side, from data/seed/users.json. A route
// handler never trusts a client-claimed role, so this is a genuine
// enforcement point, not just UI-level hiding.
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import { DemoUserSchema, type DemoUser, type Role } from "../../types/user.js";
import { z } from "zod";

const USERS_FILE = path.resolve(process.cwd(), "data", "seed", "users.json");

let cachedUsers: DemoUser[] | undefined;
async function loadUsers(): Promise<DemoUser[]> {
  if (cachedUsers) return cachedUsers;
  const raw = await readFile(USERS_FILE, "utf-8");
  cachedUsers = z.array(DemoUserSchema).parse(JSON.parse(raw));
  return cachedUsers;
}

export async function listDemoUsers(): Promise<DemoUser[]> {
  return loadUsers();
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: DemoUser;
    }
  }
}

export async function attachUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = req.header("x-demo-user-id");
  if (!userId) {
    res.status(401).json({ error: "Missing x-demo-user-id header." });
    return;
  }
  const users = await loadUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) {
    res.status(401).json({ error: "Unknown demo user id." });
    return;
  }
  req.user = user;
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: `This action requires role: ${roles.join(" or ")}.` });
      return;
    }
    next();
  };
}

/** For routes shaped /api/hcp/:hcpId/..., refuses any hcpId that is not the caller's own. */
export function requireOwnHcp(req: Request, res: Response, next: NextFunction): void {
  const { hcpId } = req.params;
  if (!req.user || req.user.role !== "hcp" || req.user.hcpId !== hcpId) {
    res.status(403).json({ error: "You may only access your own HCP record." });
    return;
  }
  next();
}
