# Pharma Sales & Field Force Performance Analyzer

A locally-deployable, multi-agentic build of the dashboard/chatbot described
in [PROBLEM_STATEMENT.md](PROBLEM_STATEMENT.md), implementing
[CLAUDE.md](CLAUDE.md)'s full **six-agent** design over a local **MCP**
(Model Context Protocol) server — no paid services, no external
infrastructure beyond an optional free-tier OpenRouter key.

All data in this build is **synthetic/fabricated** (`data/sample_calls.csv`).
No real HCP, rep, or CRM data is used anywhere.

## Quickstart

```bash
pip install -r requirements.txt   # pandas, streamlit, python-dotenv, requests, pytest, mcp
cp .env.example .env               # optional — see "Adding a real OpenRouter key" below
streamlit run frontend/app.py
```

Open the local link Streamlit prints, typically **http://localhost:8501**.

In the sidebar: pick a role (this scopes which territories the agents can
see — try "Territory Manager" to see context isolation in action),
optionally upload your own CSV in the same schema as
`data/sample_calls.csv`, and use the **Territory KPIs**, **Rep Ranking &
Recommendation**, **Prescriber Trends**, and **Chatbot** tabs.

## Architecture: six agents over a local MCP server

```
frontend/app.py  (orchestrator's caller, via agents/orchestrator_agent.py)
        │  one MCP ClientSession per Streamlit rerun (stdio transport)
        ▼
backend/mcp_client.py  ──spawns──▶  backend/mcp_server.py  (subprocess, same venv)
                                       │
                                       ├─ profile_and_normalize_data     → agents/data_profiler_agent.py      (Sales Data Profiler)
                                       ├─ compute_territory_kpis_tool    → agents/coverage_kpi_agent.py       (Coverage KPI Agent)
                                       ├─ compute_rep_kpis_tool          → agents/coverage_kpi_agent.py       (Coverage KPI Agent)
                                       ├─ compare_territories            → agents/territory_analyst_agent.py  (Territory Analyst)
                                       ├─ analyze_prescriber_trends       → agents/prescriber_trend_agent.py   (Prescriber Trend Agent)
                                       ├─ rank_and_recommend              → agents/ranking_recommendation_agent.py (Ranking/Recommendation Agent)
                                       └─ qa_validate                     → agents/qa_test_agent.py            (QA/Test Agent)
```

Each of CLAUDE.md's six agents has exactly one MCP-exposed responsibility
(the Coverage KPI Agent gets two tools — territory- and rep-level — since
both are the same "compute deterministic KPIs from normalized data" job).
Agents never reimplement each other's math: the Territory Analyst only
ranks/annotates the Coverage KPI Agent's output, the Ranking/Recommendation
Agent only derives a score from KPIs already computed upstream, and the
**QA/Test Agent always runs before a ranking, recommendation, or answer
reaches the UI** — both tabs and the chatbot call `qa_validate` and block
the output on a failing check rather than just logging a warning.

Routing (which tool(s) to call, in what order, for a given question or tab)
is deterministic Python in `agents/orchestrator_agent.py` — an LLM never
picks the tool or computes the number, only rephrases text that was already
computed.

### Why passing row-level data to the MCP server isn't a governance violation

GOVERNANCE.md's "never send row-level or HCP-identifying data to an
external LLM provider" rule is about the one actual third-party network
call this app makes: OpenRouter. The MCP server is **our own local
subprocess**, spawned over stdio on localhost with no network socket and no
third party involved — it's internal IPC, the local equivalent of a
function call across a process boundary. Normalized row-level data is
passed freely between the orchestrator and the MCP server for this reason.
The minimization rule is enforced at the one place it actually applies:
`backend/llm_client.py`'s `OpenRouterClient.rephrase()` only ever receives
the small, already-aggregated text needed to phrase the current answer,
never raw per-HCP/per-rep rows.

### Known tradeoff: one subprocess spawn per Streamlit rerun

`frontend/app.py` opens exactly one MCP `ClientSession` per rerun (not one
per tool call, and not a long-lived cached background session), reuses it
for every tool call needed in that rerun, then closes it. This means each
UI interaction pays one subprocess-spawn cost (well under a second in
practice). This is a deliberate simplicity/latency tradeoff for a
single-user local demo — a persistent background session would avoid the
repeated spawn but adds stale-connection/cleanup complexity that isn't
worth it here. Documented so it doesn't get mistaken for a bug.

## Adding a real OpenRouter key

The app works fully with **zero key and zero network access** — the
chatbot/recommendation text falls back to deterministic templates, visibly
labeled as such in the UI.

To turn on LLM-phrased answers:

1. Get a free key at https://openrouter.ai/keys (no card required for
   `:free`-suffixed models).
2. Put it in `.env`: `OPENROUTER_API_KEY=sk-or-...`
3. Optionally change `OPENROUTER_MODEL` in `.env` — the free-model catalog on
   OpenRouter changes month to month, so if the default in `.env.example`
   has been retired, pick a current one from
   https://openrouter.ai/models?max_price=0. No code change is needed either
   way: a missing key, a dead model, a network error, or a malformed
   response all fall back to the deterministic path automatically, and the
   fallback reason is logged.

The LLM is only ever asked to **rephrase numbers that were already computed
deterministically** — it never computes a KPI, ranking, or score itself,
and it only ever sees the small aggregated slice needed to answer the
current question, never raw per-HCP/per-rep rows (see
`agents/orchestrator_agent.py`).

## Running tests / eval

```bash
pytest tests/ -q          # unit tests — no network; one subprocess-based MCP integration test, no wall-clock dependency
python evals/run_eval.py  # golden-dataset reconciliation (computed vs. hand-computed expected), including the MCP tool-call path
```

## What this build includes

- The full six-agent split from CLAUDE.md's Agent Design, each with a
  single responsibility, wired together as MCP tool calls rather than
  direct Python imports (`agents/`, `backend/mcp_server.py`,
  `backend/mcp_client.py`).
- Deterministic, pure, unit-tested KPI functions (`analytics/kpis.py`):
  reach, frequency, coverage, call productivity, target attainment,
  territory growth — plus HCP trend classification
  (`analytics/prescriber_trends.py`).
- Deterministic ranking with one documented tie-break rule and a
  minimum-sample threshold that flags (never ranks) sparse reps or HCPs
  (`recommendation/ranking.py`, `analytics/prescriber_trends.py`).
- A blocking evidence-check + off-label/promotional-phrase filter
  (`agents/qa_test_agent.py` over `governance/checks.py`) that runs before
  *and after* any LLM rephrasing, and before every ranking/recommendation
  is shown in the UI — a failing check blocks the output, it does not just
  warn.
- Role/territory-scoped access: a Territory Manager's agent context never
  includes another territory's data
  (`agents/orchestrator_agent.py::AccessScope`), enforced by filtering rows
  before any MCP tool call, not by prompting the LLM to ignore data.
- An OpenRouter client with strict response-shape validation and an
  always-available deterministic fallback, with the serving path
  (`llm` vs `deterministic`) visible in the UI and in logs
  (`backend/llm_client.py`).
- A small golden dataset with hand-computed expected KPIs/ranking/trends
  for regression checking, verified against both the direct-function-call
  path and the real MCP tool-call path (`evals/`).

## What's deferred (full CLAUDE.md scope, not built here)

- `.claude/skills/` and `.claude/hooks/` as separate, independently
  invocable artifacts (e.g. `upload-validation`, `duplicate-call-check`,
  `tie-handling`, `evidence-check` as standalone hooks). Their logic exists
  and is enforced (`analytics/normalization.py`, `governance/checks.py`,
  `recommendation/ranking.py`), just not packaged as discrete skill/hook
  files.
- Any live CRM/data-warehouse/document-repository connection. The MCP
  server in this build exposes our *own* KPI/ranking/QA tools to our *own*
  orchestrator — it is not the governed external CRM/warehouse MCP
  connection CLAUDE.md's MCP section describes, which remains explicitly
  out of scope for this phase.
- RAG and enterprise authentication — this is a local, single-user,
  file-upload-only build.
- Production deployment, pilot rollout, and compliance sign-off — this is a
  local dev build for demoing the approach, not a deployed system.
- Security/red-team testing (prompt-injection, cross-territory access
  probing, etc.) beyond the access-scope filtering and governance checks
  already unit-tested.

## Repository layout

See [CLAUDE.md](CLAUDE.md) for the target full layout. This build populates:
`analytics/`, `recommendation/`, `governance/`, `agents/` (all six),
`backend/` (config, LLM client, MCP server + client), `frontend/`
(Streamlit UI), `data/` (synthetic sample), `evals/`, `tests/` (mirrors the
module layout above, including one real MCP-subprocess integration test).
