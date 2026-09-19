# CLAUDE.md — Pharma Sales & Field Force Performance Analyzer

See [PROBLEM_STATEMENT.md](PROBLEM_STATEMENT.md) for the business case and
[GOVERNANCE.md](GOVERNANCE.md) for the non-negotiable data/privacy/AI-governance
rules. This document is the technical convention layer between the two.

This is the **scaffolding phase**: repository structure, conventions, agent
design, and guardrails are defined here before application code is written.
No application code is built in this phase.

## Tech Stack

Not fixed yet. Pick the smallest stack that satisfies
[PROBLEM_STATEMENT.md](PROBLEM_STATEMENT.md)'s requirements; get explicit
user approval before introducing a new framework, database, or network
service. Whatever is chosen, KPI/ranking math must live in pure,
unit-testable functions, separate from both the UI and any LLM call.

- **LLM routing: OpenRouter.** Every LLM-backed call (recommendation
  phrasing, chatbot explanations) goes through OpenRouter rather than a
  hardcoded single-provider SDK, so the underlying model can be swapped via
  config without a code change. Follow the LLM/deterministic split: try the
  OpenRouter call, strictly validate the response shape, and fall back to a
  template-based deterministic path if the call fails or the response is
  invalid — every LLM-backed feature must work with zero network access in
  tests via a stub/null LLM client.
- OpenRouter keys/model IDs come from `.env` (git-ignored) via a config
  loader — never hardcoded, never logged.

## Repository Structure

Standard git workflow (main + feature branches, PR review before merge).
Target layout:

```
/frontend        - dashboard & chatbot UI
/backend         - API layer, request routing to agents
/analytics       - KPI engine, territory/HCP analytics (pure, deterministic functions)
/recommendation  - ranking + recommendation generation logic
/agents          - agent definitions (see Agent Design below)
/governance      - policy-as-code checks (evidence checks, off-label filters, access rules)
/tests           - unit + integration tests, mirrors the module layout above
/evals           - golden dataset + LLM/agent evaluation harness
/deployment      - environment/deployment config
/monitoring      - observability, dashboards, alerting config
```

## Modular Coding Standards

- Business logic (KPI formulas, ranking, segmentation) lives in pure
  functions in `analytics/` / `recommendation/` — no LLM calls, no UI
  dependency, testable in isolation.
- Agents in `agents/` orchestrate calls to those pure functions and to
  Claude; they never reimplement KPI math themselves.
- Type hints required on all function signatures.
- No function over ~50 lines; extract helpers when branching logic grows.
- No global mutable state; pass data explicitly between functions.
- One responsibility per module. Avoid circular imports.

## Skills, Hooks & Guardrails

**Skills** (`.claude/skills/`) — one skill per analytical discipline, so
every agent (and every human) applies the same approved method instead of
re-deriving it:

- `sales-kpi-design` — exact reach/frequency/coverage/attainment/growth formulas
- `coverage-analysis` — how coverage gaps are identified and prioritized
- `territory-segmentation` — how territories are grouped/compared fairly
- `prescriber-trends` — HCP trend-direction methodology and the minimum-sample rule
- `recommendation-writing` — approved commercial language, the evidence-citation format, and the disallowed off-label/promotional phrase list

**Hooks** (`.claude/hooks/`) — automated checks that run around data
ingestion and output generation, not optional manual review steps:

- `upload-validation` — schema/type/size check before any file is processed
- `hcp-territory-normalization` — territory-code aliasing/dedup before KPI computation
- `duplicate-call-check` — rejects/flags duplicate rep/HCP/date call records
- `aggregation-reconciliation` — verifies rolled-up territory/region numbers sum back to the row-level data they came from
- `tie-handling` — applies the one documented tie-break rule everywhere a ranking is produced
- `evidence-check` — blocks any recommendation/chatbot output that cites a number without a traceable KPI source (the automated counterpart to the QA/Test Agent below)

**Guardrails** — non-negotiable, enforced in code (full policy in
[GOVERNANCE.md](GOVERNANCE.md)):

- Never let an LLM compute a KPI, ranking, or score — it may only phrase numbers already computed deterministically.
- Never send HCP-identifying data or full row-level datasets to OpenRouter (or any external LLM provider) — only the aggregated, minimized slice needed for the current question (see Context Engineering below).
- Never emit off-label, dosing, or efficacy language — checked by the `evidence-check` hook against the `recommendation-writing` skill's disallowed-phrase list, not by prompting alone.
- Never bypass `upload-validation`, `duplicate-call-check`, or `hcp-territory-normalization` by loading data another way.
- No hook or guardrail is advisory — a failing check blocks the output; it does not just log a warning.

## Agent Design

Six agents, each with a single responsibility. Don't merge them or add more
without a clear reason — unnecessary multi-agent complexity is explicitly
out of scope (see [PROBLEM_STATEMENT.md](PROBLEM_STATEMENT.md)'s AI
Suitability Assessment).

1. **Sales Data Profiler** — validates and normalizes uploaded CRM/call/prescription data (schema, dedup, territory-code normalization); reports data-quality issues, does not compute KPIs.
2. **Coverage KPI Agent** — computes reach/frequency/coverage/call-productivity/target-attainment from normalized data using the deterministic KPI engine.
3. **Territory Analyst** — compares territories using the KPI Agent's output; performs no independent KPI calculation of its own.
4. **Prescriber Trend Agent** — analyzes HCP-level engagement/prescription trends; must respect minimum-sample thresholds (flag, don't rank, sparse HCPs — see [GOVERNANCE.md](GOVERNANCE.md) §4).
5. **Ranking/Recommendation Agent** — produces rep rankings and recommendations strictly from upstream agents' outputs; every recommendation must cite the metric(s) behind it.
6. **QA/Test Agent** — validates calculations and evidence citations before any ranking, recommendation, or executive summary reaches a user; the last gate before output ships.

## Context Isolation

- Managers and agents are scoped to their **authorized territories/products
  only** — a Territory Manager's agent context never includes another
  territory's data.
- Aggregate-only consumers (e.g. an executive-summary agent) receive
  rollups, not row-level data — individual HCP records stay out of any
  context that only needs an aggregate insight.
- Enforce this at the data-access layer, not by prompting the LLM to
  "ignore" data it was never given in the first place.

## Delegation / Orchestration

- Requests route to the KPI, territory, HCP-trend, or recommendation agent
  based on question type; don't let one agent silently do another's job.
- The **QA/Test Agent always runs before** a ranking, recommendation, or
  executive summary is shown. It checks that every number traces to a
  computed KPI and that no unsupported claim is present. A failing QA check
  blocks the output — it does not just attach a warning.

## Context Engineering & Memory

Each agent call gets only:

- The relevant territory/product/time-range slice — never the full dataset
- Approved KPI definitions from the KPI engine — never re-derived by the LLM
- A short summary of prior analytical steps in the current session — not the raw data behind them
- Only the tool outputs needed to answer the current question

Do not pass raw per-HCP or per-rep row data into a prompt when an aggregate
answers the question.

## Tools / Plugins

CSV/XLSX parsers, Pandas, a charting library, a SQL/CRM API client (only
once a governed connection is approved — see MCP below), and code-review
tooling. No new tool or plugin without explicit user approval.

## RAG (optional)

Not required for the numerical dashboard/chatbot itself. Only introduce RAG
if the assistant needs to reference commercial policies, approved product
information, or field-force SOPs/definitions — treat this as a deliberate
later decision, not a default.

## MCP (optional)

Use MCP only for a governed connection to a CRM, data warehouse, document
repository, or workflow system, and only once that connection is explicitly
approved. Do not wire up a live CRM/warehouse connection during this
scaffolding phase.

## Custom MCP (optional)

A "Commercial Analytics MCP" exposing approved KPI data/services to
multiple agents/apps is a reasonable future consolidation once more than
one app needs the same KPI access — not needed for a single app.

## Testing Requirements

- Unit tests for every KPI formula (reach/frequency/coverage/attainment/growth): normal, boundary (e.g. zero target, single-call HCP), and invalid-input cases.
- Tests for filters/aggregations, ranking (including tie-handling), minimum-sample flagging, and role-based territory restrictions.
- File-ingestion tests: schema validation, duplicate detection, malformed-file rejection.
- Chatbot/agent tests: every answer that states a number must be traceable to a fixture KPI value — assert on the citation, not just the prose.
- No test depends on network access or wall-clock time without explicit injection/mocking.

## Golden Dataset + Evaluation

Maintain a synthetic sales dataset with known, hand-computed expected
KPIs/rankings under `/evals`. Track: reconciliation accuracy (computed vs.
expected), recommendation relevance/compliance, agent task-completion rate,
and latency. Re-run on every change to KPI or ranking logic.

## Security / Red-Team

Full policy in [GOVERNANCE.md](GOVERNANCE.md) §11. At minimum, test for:
HCP-data extraction via chatbot, unauthorized cross-territory access,
ranking manipulation, prompt injection toward off-label/unsupported claims,
and tool misuse — before every release that touches agents or the
recommendation engine.

## Observability

Log data-processing events, KPI outputs, recommendation evidence,
agent/tool traces, token usage, latency, and errors. Every recommendation's
log entry must include the evidence it cited, so a compliance review can
reconstruct why it was generated.

For every OpenRouter call specifically, capture: model name/version,
prompt/response token counts, latency, HTTP status, and which path served
the answer (`llm` vs. `deterministic` fallback) — the fallback path must be
visible in logs/metrics, not just in behavior, so a silent provider outage
or rate-limit doesn't read as a healthy system.

## Load / Cost

Before production use, test with a full-scale field-force dataset,
concurrent regional users, and measure dashboard response time and
per-session model cost — not just correctness.

## CI/CD

Every change to KPI/ranking logic, role-access rules, or agent prompts runs
KPI regression tests, role-access tests, and recommendation/prompt
evaluation plus the security checks above, before merge.

## Human-in-the-Loop

- Managers must review any output that could feed a **consequential
  business decision** (compensation, discipline, territory reassignment,
  promotional claims, regulatory submissions) — the system surfaces
  analysis, it does not decide.
- Recommendations must disclose missing or sparse data rather than
  presenting a confident answer built on thin evidence.
- Fall back to plain descriptive analytics (no ranking/recommendation)
  whenever confidence is insufficient — never force a ranking out of
  insufficient data.

## Pilot → Production

Pilot with one brand/region first; compare outputs against existing
commercial reports and get manager + compliance sign-off before wider
rollout. Production deployment requires enterprise authentication, full
auditability, and secure data access — none of which exist yet at this
scaffolding stage.

## Definition of Done

A change is "done" only when:

1. It respects the module/agent boundaries above (pure KPI logic separate from agents/UI).
2. It has passing tests covering new/changed logic, including the golden-dataset check where relevant.
3. It complies with [GOVERNANCE.md](GOVERNANCE.md) — no exceptions without explicit user sign-off.
4. Context isolation and role-based access are preserved for any new agent, tool, or data path.
5. No destructive, out-of-project, or credential-exposing commands were run.
