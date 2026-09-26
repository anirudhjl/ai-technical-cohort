# HCP Address Intelligence

A locally-running agentic pipeline that captures, validates, standardizes,
reconciles, and enriches Healthcare Professional (HCP) address data — built
to demonstrate all 12 mandatory agentic-AI components against the business
rules and guardrails in [`CLAUDE.md`](./CLAUDE.md).

Two RBAC-separated views, no login screen — a header dropdown switches
between seeded demo identities, and the **server** (not the browser) resolves
that identity to a role on every request.

## Setup

Requires Node.js 22+.

```bash
npm install
npm --prefix web install
npm run seed        # writes data/seed/*.json and data/sample-sources/*.json if missing (idempotent)
npm run dev          # starts the API (port 4000) and the web app (port 5173) together
```

Open **http://localhost:5173**.

`npm run seed` never overwrites existing data — safe to re-run at any time.
If you want to reset to the clean baseline, delete `data/seed/`,
`data/sample-sources/`, and the contents of `data/cases/` / `data/audit/` /
`logs/`, then run `npm run seed` again.

### Other scripts

```bash
npm test        # unit + orchestrator-integration + adversarial guardrail tests (vitest)
npm run eval     # runs the golden fixtures + adversarial suite through the real pipeline,
                 # writes docs/evaluation-report.md with metrics from that run
npm run build    # tsc typecheck/build of the backend
```

`npm test` and `npm run eval` both spawn the real MCP server child processes
and read/write the real `data/` files — stop `npm run dev` first so they
don't fight over the same case files, and expect the golden-record seed file
to be snapshotted and restored automatically around the run.

## Demo walkthrough

1. Open http://localhost:5173. The header shows a user switcher seeded from
   `data/seed/users.json`: two HCPs (Dr. Alice Nguyen, Dr. Marcus Webb) and
   one Data Steward (Priya Raman).
2. Switch to **Priya Raman (Data Steward)**. Click **Ingest next record**
   four times — once per seeded source file in `data/sample-sources/`. You
   should see four cases land in the queue with different outcomes:
   - `crm_export` / Alice Nguyen → exact NPI match, address matches the
     golden record exactly → **quality band: auto**
   - `onekey_feed` / Marcus Webb → exact NPI match, but a new suite number
     the golden record doesn't have → **reconciliation: variation**
   - `license_board` / "E. Petrov" → no NPI, weak name-only match → identity
     confidence lands **below the auto-proceed floor**
   - `rep_form` / Elena Petrov → exact NPI match, but a city/state that
     conflicts with the golden record → **reconciliation: conflict**
3. Open any case. You'll see the full evidence trail, every guardrail check
   with its pass/fail note, and the append-only audit trail rendered as a
   timeline — this is the literal request → plan → agent → skill → tool →
   evidence → decision → guardrail check → human approval → final action
   chain from `CLAUDE.md`. **Every case halts here for human approval**,
   regardless of band — the band only changes how much scrutiny it needs.
4. Approve a case with a reason (optionally editing the standardized address
   first). Confirm it reaches `completed` and the HCP's golden record
   (`data/seed/hcp-master.json`) gained a **new** address-history version —
   the old version is still there, never overwritten.
5. Reject a case with a reason. Confirm it lands at `rejected` and the golden
   record is untouched.
6. Switch to **Dr. Alice Nguyen (HCP)**. Confirm she sees only her own
   current address, her own history, and a plain-language status of her own
   case — no guardrail detail, no other HCP's data. Calling
   `GET /api/hcp/HCP-1002/address` with Alice's `x-demo-user-id` returns
   `403`, even though the URL is just one digit away from her own.
7. Open the **Observability** tab as the Data Steward: recent structured log
   lines and counts by outcome, read from `logs/agent-events.log` — durable
   across server restarts, not just in-memory for the current process.

## Architecture

```
React (web/, :5173) --/api proxy--> Express API (src/api, :4000)
                                        |
                          Orchestrator (src/orchestrator)
                                        |
        7 sub-agents (src/agents) -- each calls Skills (src/skills)
                                        |
                    Runtime hooks (src/hooks/hookRunner.ts)
                    - MCP allowlist (PreToolUse)
                    - block golden-record writes w/o approval (PreToolUse)
                    - PII-masked structured logging (PostToolUse)
                                        |
              3 real MCP servers (src/mcp-servers, stdio child processes)
              - crm-mdm            (read/append-only write of the golden HCP record)
              - address-validation (deterministic standardization)
              - audit-store        (append-only audit ledger)
                                        |
                              data/ (JSON files)
```

RBAC is enforced in `src/api/middleware/rbac.ts`: the client sends a seeded
`x-demo-user-id` header, and the server looks up `{id, name, role, hcpId?}`
from `data/seed/users.json` — a route handler never trusts a client-claimed
role, and an HCP route additionally checks the caller's own `hcpId` before
returning anything.

## The 12 mandatory components → where they live

| # | Component | Where |
|---|---|---|
| 1 | **CLAUDE.md** | [`CLAUDE.md`](./CLAUDE.md) — architecture, coding standards, 7 business rules, guardrails, traceability contract. Every rule below is cross-referenced back to it in code comments. |
| 2 | **Skills** | `src/skills/` — `address-standardizer`, `identity-matcher`, `confidence-scorer`, `pii-masker`, `source-intake-normalizer`, `audit-trace-writer`. Pure, unit-tested functions; agents call these instead of duplicating logic. |
| 3 | **Hooks** | Two mechanisms, on purpose: (a) **runtime guardrail hooks**, `src/hooks/hookRunner.ts` — PreToolUse (MCP allowlist, block golden-record writes without approval) and PostToolUse (PII-masked logging) around every MCP call; (b) **Claude Code dev-time hook**, `.claude/settings.json` + `.claude/hooks/run-tests-on-change.mjs` — runs `vitest related` whenever Claude Code edits a file under `src/`. |
| 4 | **Sub-agents** | `src/agents/` — Source Intake, Identity Resolution, Address Validation, Reconciliation, Confidence/Quality, Guardrail/Compliance, Master Data — orchestrated by `src/orchestrator/orchestrator.ts`. |
| 5 | **MCP** | `src/mcp-servers/` (`crm-mdm`, `address-validation`, `audit-store`), each a real `@modelcontextprotocol/sdk` stdio server spawned as its own child process, called only through `src/mcp-clients/mcpClient.ts` → `src/hooks/hookRunner.ts`. |
| 6 | **State / Context / Memory** | `src/types/case.ts`'s `WorkflowCaseRecord` (Zod-validated), persisted per case under `data/cases/<caseId>.json` via `src/state/caseStore.ts`. One case at a time — no cross-case memory, so nothing is inferred across records (Rule 7). |
| 7 | **Guardrails** | `src/guardrails/rules.ts` — 4 independently-testable predicate functions, enforced in code (not just prompted): no unsupported address generation, no autonomous golden-record edit, no unapproved MCP access, no action below the identity-confidence floor. |
| 8 | **AI Governance** | PII masking (`src/skills/pii-masker.ts`) before any log write; RBAC (`src/api/middleware/rbac.ts`); approve/reject restricted to the `data_steward` role; every decision attributed to an agent or a named human approver in the audit trail; secrets read only via `process.loadEnvFile` / `ANTHROPIC_API_KEY`, never hard-coded. |
| 9 | **Human-in-the-Loop** | `src/agents/guardrailComplianceAgent.ts` halts **every** case at `awaiting_approval`; `src/orchestrator/orchestrator.ts`'s `recordHumanApproval` requires a `data_steward` approver and a non-empty reason before `masterDataAgent` may run. |
| 10 | **Evaluation** | `test/fixtures/` (golden cases with known-correct outcomes), `test/unit/orchestrator.test.ts`, `test/adversarial/guardrail-bypass.test.ts`, and `scripts/eval.ts` → `docs/evaluation-report.md` (real metrics from a real run, not placeholders). |
| 11 | **Observability** | `src/observability/logger.ts` — one structured JSON line per agent step (`caseId, agent, skill, tool, durationMs, outcome, modelUsed?, tokenUsage?`) to `logs/agent-events.log`, PII-masked before it's written, hydrated back into memory on server restart, surfaced in the web app's Observability tab. |
| 12 | **Traceability** | Every `WorkflowCaseRecord.auditTrail[]` entry *is* the chain: request → plan → agent → skill → tool → evidence → decision → guardrail check → human approval → final action — rendered as a timeline in the case-detail view. |

## LLM usage (deliberately narrow)

Per Business Rule 7 ("agents must not infer missing HCP information without
evidence"), only two steps ever call an LLM — `src/orchestrator/llm.ts`:
parsing a free-text field-rep note, and writing the human-readable approval
summary shown to the Data Steward. Both call the real Claude API only if
`ANTHROPIC_API_KEY` is set (copy `.env.example` to `.env`); otherwise they
fall back to a deterministic template and log
`llm_skipped: no API key, deterministic fallback used`. The demo runs fully
with zero secrets configured.

## Seeded demo data

- `data/seed/users.json` — 2 HCP identities + 1 Data Steward (no passwords;
  the switcher sends a seeded id, the server resolves the role).
- `data/seed/hcp-master.json` — 3 golden HCP records, each starting at
  address-history version 1.
- `data/sample-sources/*.json` — 4 seeded source records, one per approved
  source system, each deliberately tuned to land on a different pipeline
  outcome (see the walkthrough above). These mirror — but are intentionally
  decoupled from — the fixtures under `test/fixtures/`, so editing one can
  never silently break the other.
