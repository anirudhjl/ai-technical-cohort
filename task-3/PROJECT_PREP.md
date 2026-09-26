# HCP Address Intelligence — Capstone Prep

Status: **Planning only — no implementation yet.** This consolidates the problem
statement, the existing `CLAUDE.md`, and the two prior sketches
(`multi-agent-architecture.md`, `target-architecture.md`) into one working design
to review before any code is written.

---

## 1. Business Problem & Objective

**Function:** Master Data Management / Commercial Operations (HCP data underpins
territory alignment, sample/marketing compliance, and rep call planning).

**Problem:** HCP (Healthcare Professional) address data arrives continuously from
multiple sources of uneven trust — CRM systems (e.g. Veeva), purchased reference
data (e.g. IQVIA OneKey), state medical license boards, and field-rep-submitted
notes. These sources disagree, go stale, and get duplicated. Acting on the wrong
address has real consequences: samples/materials shipped to an unlicensed or
outdated location, wasted field spend, and compliance exposure.

**Objective:** An agentic workflow that takes in a raw HCP address record from an
approved source, validates and standardizes it, resolves identity against the
existing HCP master, computes a rules-based confidence score, detects conflicts
with what's already on file, and either (a) safely auto-applies a low-risk update
with full history retained, or (b) halts and routes to a human Data Steward for
approval — never silently overwriting, never fabricating missing data, and never
creating a master record from an unverified source. Every step is logged into an
end-to-end trace.

This directly implements `CLAUDE.md`'s 7 Business Rules and 4 Guardrails — this
prep treats those as hard requirements, not suggestions.

---

## 2. Architecture (refined from the two prior sketches)

```
User / Source Feed (CRM export, OneKey feed, license-board file, rep form)
        │
        ▼
  Orchestrator (Node.js + TypeScript)
   - builds the plan for this case
   - persists Workflow Case Record (state)
   - delegates to sub-agents in order
   - enforces guardrail checkpoints
   - requests human approval when required
   - assembles the final trace + action
        │
        ├──► Source Intake Agent      (tags source system + timestamp; rejects unapproved sources)
        ├──► Identity Resolution Agent (matches to existing HCP master; computes identity confidence)
        ├──► Address Validation Agent (standardizes postal format; never invents missing fields)
        │
        ▼
  Reconciliation Agent   (exact match / minor variation / conflict, vs. golden record)
        ▼
  Confidence & Quality Agent  (rules-based score → auto-apply / needs-review / reject band)
        ▼
  Guardrail / Compliance Agent  (checks the 4 guardrails before anything is applied)
        ▼
  ┌─────────────┴─────────────┐
  ▼                           ▼
Auto-approved            HUMAN REVIEW (Data Steward)
  │                           │
  └─────────────┬─────────────┘
                 ▼
       Master Data Agent  (ONLY agent with write access; appends history, never overwrites)
                 ▼
         MCP Layer (approved systems only)
      ├─ CRM/MDM (read HCP master + addresses)
      ├─ Address validation service
      └─ Audit/trace store (append-only)
```

Each sub-agent has one clear responsibility and calls **Skills** for reusable
logic rather than reimplementing it, and reaches external systems only through
**MCP tools** — never direct DB/API calls.

---

## 3. Mapping to the 12 Mandatory Agentic AI Components

| # | Component | How this project implements it |
|---|---|---|
| 1 | **CLAUDE.md** | Already in place — architecture, coding standards, 7 business rules, guardrails, traceability contract. |
| 2 | **Skills** | `address-standardizer`, `identity-matcher`, `confidence-scorer`, `audit-trace-writer`, `pii-masker`, `source-intake-normalizer` — shared logic every agent calls instead of duplicating. |
| 3 | **Hooks** | PreToolUse hook allowlisting only the 3 approved MCP servers; PreToolUse hook blocking any "write master record" call unless an approval flag is present in case state; PostToolUse hook masking PII before any log write; a test-on-change hook running unit tests when `src/` files change. |
| 4 | **Sub-agents** | Orchestrator + 7 specialists (Source Intake, Identity Resolution, Address Validation, Reconciliation, Confidence/Quality, Guardrail/Compliance, Master Data) — each with a scoped responsibility, shown coordinating rather than one LLM doing everything. |
| 5 | **MCP** | Three approved MCP servers: CRM/MDM (read), Address Validation (validate/standardize), Audit Store (append-only write). No other system is reachable — enforced by hook, not just prompt instruction. |
| 6 | **State/Context/Memory** | A per-case `Workflow Case Record` (typed TS interface) persisted across every agent step — carries evidence, decisions, guardrail results, approval status. Deliberately scoped to one case at a time; no cross-case memory, so nothing gets inferred across records (Rule 7). |
| 7 | **Guardrails** | The 4 in `CLAUDE.md`, each enforced as a concrete code/hook check, not just a prompt: no unsupported address generation, no autonomous golden-record edits, no unapproved DB access, no action below identity-confidence threshold. |
| 8 | **AI Governance** | PII masking in logs, role-based approval (only "Data Steward" role can approve), secrets via env/secret-manager stub only, every decision attributed to an actor (agent or human) in the trail. |
| 9 | **Human-in-the-Loop** | Mandatory approval gate before: creating a new master record, resolving a source conflict, or proceeding on a "needs-review" confidence band. Approval/rejection + reason is written back into case state before Master Data Agent can run. |
| 10 | **Evaluation** | Golden test fixtures with known-correct outcomes; metrics below (§7). |
| 11 | **Observability** | Structured JSON log per agent step: caseId, agent, skill, tool, duration, outcome, model/token usage where an LLM reasoning step is actually used. |
| 12 | **Traceability** | The case's `auditTrail[]` *is* the record: request → plan → agent → skill → tool → evidence → decision → guardrail check → human approval → final action — renderable as a human-readable report. |

---

## 4. Sub-agent Detail

| Agent | Input | Output | Skill(s) used | MCP/Tool | Guardrail checked |
|---|---|---|---|---|---|
| **Source Intake** | Raw record + source tag | Normalized record w/ source system + timestamp | `source-intake-normalizer` | — | Rejects unapproved source (Rule 1, 2) |
| **Identity Resolution** | Normalized record | Candidate HCP match + identity confidence | `identity-matcher` | CRM/MDM (read) | No action below identity threshold |
| **Address Validation** | Raw address | Standardized address, validity flags | `address-standardizer` | Address Validation service | No unsupported address generation |
| **Reconciliation** | Standardized address + existing master address(es) | match / variation / conflict | — | CRM/MDM (read) | Surface conflicts, don't silently resolve (Rule 5) |
| **Confidence/Quality** | All of the above | Score + band (auto / review / reject) | `confidence-scorer` | — | Confidence per defined rules (Rule 4) |
| **Guardrail/Compliance** | Proposed action + all evidence | Pass/fail per guardrail | `pii-masker`, `audit-trace-writer` | Audit Store | All 4 guardrails, gate point |
| **Master Data (write)** | Approved action only | New address version, history retained | `audit-trace-writer` | CRM/MDM (write), Audit Store | No overwrite without history (Rule 3); no autonomous edit (guardrail) |

---

## 5. State / Context Model (planning-level shape, not final code)

```ts
interface WorkflowCaseRecord {
  caseId: string;
  request: { sourceSystem: string; receivedAt: string; rawPayload: unknown };
  identity: { candidateHcpId?: string; confidence: number; evidence: string[] };
  address: { raw: string; standardized?: string; validationFlags: string[] };
  reconciliation: { status: "match" | "variation" | "conflict"; details: string[] };
  qualityScore: { value: number; band: "auto" | "review" | "reject"; ruleTrace: string[] };
  guardrailChecks: { rule: string; passed: boolean; note?: string }[];
  humanApproval?: { status: "approved" | "rejected"; approver: string; role: string; reason: string; timestamp: string };
  finalAction?: { type: string; appliedAt: string; masterRecordVersion: string };
  auditTrail: { timestamp: string; agent: string; skill?: string; tool?: string; evidence?: string; decision: string }[];
}
```

Persistence for the prototype: a local JSON/SQLite case store keyed by `caseId`
(stand-in for an enterprise workflow engine) — every agent reads/writes this so
any step can resume exactly where the case left off.

---

## 6. Human-in-the-Loop Gate

Triggers (any one is enough to halt for review):
- Proposed creation of a brand-new HCP master record.
- Reconciliation status = `conflict`.
- Quality band = `review`.
- Identity confidence below the auto-proceed threshold.

Mechanism (prototype): a **web-based approval dashboard** (not CLI — chosen for
live demoing/showcase) with a case queue and a per-case detail view showing
source, evidence collected, proposed action, and guardrail check results, plus
approve/reject/edit controls and a required reason field. Only a "Data Steward"
role may approve. The outcome is written back into the case record and audit
trail before the Master Data Agent is allowed to run.

---

## 7. Evaluation Plan

- **Golden fixtures**: hand-built address/identity cases with known-correct outcomes.
- **Metrics**: standardization accuracy, identity-match precision/recall, confidence-score calibration, **false-auto-approve rate (target 0%)**, guardrail-bypass attempts caught (target 100%), case latency, % auto-processed vs. human-reviewed.
- **Adversarial cases**: deliberately try to trip each of the 4 guardrails (e.g. low identity confidence trying to force a create; a call aimed at an unapproved system) to prove they hold under pressure, not just on the happy path.

---

## 8. Observability & Traceability Output

Each agent step emits one structured JSON log line:
`{ caseId, agent, skill, tool, durationMs, outcome, modelUsed?, tokenUsage?, timestamp }`.
Most steps are deterministic rule/code logic per Rule 7 (no inference without
evidence); LLM calls are limited to places that genuinely need language
reasoning — e.g. parsing free-text intake notes, or writing the human-readable
summary shown to the approving Data Steward — so token/model usage is tracked
only where it's actually spent.

The full `auditTrail[]` on a case renders directly as the required trace:
request → plan → agent → skill → tool → evidence → decision → guardrail check →
human approval → final action.

---

## 9. Tech Stack (planning-level)

- TypeScript + Node.js (per your instruction and `CLAUDE.md`).
- Zod (or similar) for runtime-validated types at every agent boundary.
- Vitest or Jest for unit tests (mandatory per `CLAUDE.md` coding standards).
- Mock MCP servers standing in for CRM/MDM, address validation, and audit store, since no real enterprise systems are available in this environment.
- Local JSON/SQLite file as the case-state store (not a production DB — clearly labeled as a prototype substitute).
- Express (TypeScript) REST API backend + a React (Vite + TypeScript) single-page frontend for the case queue / approval dashboard. Optionally, Server-Sent Events (SSE) to stream live agent-step updates to the dashboard as a case moves through the pipeline — useful for a compelling showcase demo, can be added after the core flow works.

## 10. Planned Folder Structure (not yet created)

```
Session_5/
  CLAUDE.md
  PROJECT_PREP.md            (this file)
  multi-agent-architecture.md, target-architecture.md   (prior sketches, superseded by §2 above)
  .claude/
    agents/                  sub-agent definitions
    skills/                  skill definitions
    hooks/ + settings.json   hook wiring
  src/
    orchestrator/
    agents/
    skills/
    mcp-clients/
    state/
    guardrails/
    audit/
    api/                      Express routes: case queue, case detail, approve/reject/edit
    types/
  web/                        React + Vite approval dashboard (case queue, pipeline trace view, approval UI)
  test/
    unit/
    fixtures/
  data/sample-sources/       mock CRM export, OneKey-style feed, license-board feed
  docs/                      evaluation-report.md, governance.md, diagrams
  README.md
```

---

## 11. Open Decisions (flagging assumptions rather than blocking on them)

1. **Trigger shape** — assuming a batch/file-drop of source records processed one case at a time, submitted and monitored through the web dashboard (§6) rather than a CLI, so the full demo — ingestion through approval — runs in one browser-based showcase.
2. **Mock vs. real systems** — CRM/MDM, address validation, and audit store will be *mocked* MCP servers with realistic sample data, since no real enterprise systems are reachable here.
3. **Approval UI — RESOLVED**: web dashboard (Express API + React/Vite frontend), not CLI, per your feedback — needs to demo well and be showcased. Renders the case queue, per-case evidence/trace, and approve/reject/edit controls.
4. **Where LLM reasoning is actually used** — kept deliberately narrow (intake note parsing, human-readable approval summaries) so the guardrail "no inference without evidence" stays enforced by code, not just by prompting.

---

## 12. Next Steps

Once you've reviewed this and confirmed or adjusted the open decisions above,
the next step is implementation planning (folder scaffolding → skills → agents
→ orchestrator/state → guardrails/hooks → MCP mocks → HITL flow → tests/eval →
observability → README), broken into small reviewable phases. No code has been
written yet.
