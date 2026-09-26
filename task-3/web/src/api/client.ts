// Fetch wrapper that attaches the seeded x-demo-user-id header. There is no
// login screen (per explicit product decision) — the role switcher in the
// header just changes which seeded id gets sent; the server is the one that
// resolves that id to a role and enforces access, in src/api/middleware/rbac.ts.
const DEMO_USER_STORAGE_KEY = "hcp-demo-user-id";

export function getDemoUserId(): string | null {
  return localStorage.getItem(DEMO_USER_STORAGE_KEY);
}

export function setDemoUserId(id: string): void {
  localStorage.setItem(DEMO_USER_STORAGE_KEY, id);
}

export interface DemoUser {
  id: string;
  name: string;
  role: "hcp" | "data_steward";
  hcpId?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const userId = getDemoUserId();
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (userId) headers.set("x-demo-user-id", userId);

  const res = await fetch(`/api${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request to ${path} failed with ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  listUsers: () => request<DemoUser[]>("/users"),
  me: () => request<DemoUser>("/users/me"),

  hcpAddress: (hcpId: string) =>
    request<{
      hcpId: string;
      name: string;
      specialty: string;
      currentAddress: Record<string, string>;
      addressHistory: Array<Record<string, unknown>>;
      status: string;
    }>(`/hcp/${hcpId}/address`),

  listCases: (filter?: { status?: string; band?: string }) => {
    const params = new URLSearchParams();
    if (filter?.status) params.set("status", filter.status);
    if (filter?.band) params.set("band", filter.band);
    const qs = params.toString();
    return request<Array<Record<string, unknown>>>(`/cases${qs ? `?${qs}` : ""}`);
  },

  getCase: (caseId: string) => request<Record<string, unknown>>(`/cases/${caseId}`),

  ingestNextCase: () => request<Record<string, unknown>>("/cases/ingest", { method: "POST" }),

  approveCase: (caseId: string, reason: string, editedAddress?: Record<string, string | undefined>) =>
    request<Record<string, unknown>>(`/cases/${caseId}/approve`, {
      method: "POST",
      body: JSON.stringify({ reason, editedAddress }),
    }),

  rejectCase: (caseId: string, reason: string) =>
    request<Record<string, unknown>>(`/cases/${caseId}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  observabilityLogs: (limit = 100) => request<{ logs: unknown[]; metrics: Record<string, unknown> }>(`/observability/logs?limit=${limit}`),
};
