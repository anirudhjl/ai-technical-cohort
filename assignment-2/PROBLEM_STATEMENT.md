# Problem Statement — Pharma Sales & Field Force Performance Analyzer

**Style:** Commercial / Sales Operations
**Flow:** Upload rep call/prescription data → call-KPI & coverage analysis → territory/prescriber trend analysis → rep ranking → recommendations → chatbot Q&A
**AI-DLC Stage:** Project Implementation (this document + [CLAUDE.md](CLAUDE.md) + [GOVERNANCE.md](GOVERNANCE.md) are the scaffolding artifacts produced before application code is written)

## Problem

Commercial teams currently lack a consolidated, fair, and compliant view of
field-force effectiveness. Call activity, HCP (prescriber) coverage,
territory performance, and prescription trends live in separate reports
assembled manually, which makes it hard to identify coverage gaps, compare
territories on a consistent basis, or trust that rep rankings are computed
the same way for everyone. This project builds an AI-assisted analyzer that
ingests CRM/call/prescription data and produces transparent KPIs,
territory/prescriber trend analysis, fair rep rankings, and compliant,
evidence-backed recommendations — with a chatbot for ad-hoc questions whose
answers always tie back to the underlying computed metrics.

## Users & Stakeholders

- **Sales Head** — cross-territory performance oversight, resourcing decisions
- **Commercial Excellence** — KPI definitions, methodology governance, cross-brand consistency
- **Regional Managers** — compare territories within their region, spot coverage gaps
- **Territory Managers / Field Representatives** — view their own call/coverage/target performance, understand the basis of any ranking
- **Analytics** — data pipeline ownership, KPI engine maintenance
- **Compliance** — HCP data protection, promotional-language review, audit trail
- **Brand Teams** — product-level prescription trend visibility

## Business KPIs / Success Metrics

- Reach — unique HCPs called ÷ target HCP universe
- Frequency — calls per HCP per period
- Coverage — % of the target HCP list touched in a period
- Call productivity — calls per rep per day/week, weighted by outcome quality
- Target attainment — actual vs. assigned targets by rep / territory / product
- Territory growth — prescription/volume trend over time
- HCP engagement trend — rising / flat / declining engagement segments
- Recommendation adoption rate
- Analyst/manager time saved vs. the current manual reporting process

## AI Suitability Assessment

| Layer | Approach | Rationale |
|---|---|---|
| KPI math (reach, frequency, coverage, attainment, growth) | Deterministic code | Must be exactly reproducible and auditable |
| Segmentation / ranking | Rule-based / statistical (percentile bands, minimum-sample thresholds, stated tie-handling) | Fairness requires a documented, inspectable rule, not a black box |
| Predictive components (e.g. churn-risk HCP segments, growth forecasts) | ML, only if justified | Introduced only when a deterministic/statistical baseline is insufficient, and always labeled as a prediction |
| Explanations, recommendation phrasing, chatbot Q&A | LLM (Claude, routed via OpenRouter) | The LLM explains numbers computed upstream; it never computes a KPI or a ranking itself |

Multi-agent structure is used only where it improves auditability or context
isolation (see the agent list in [CLAUDE.md](CLAUDE.md)) — not added for its
own sake. LLM calls are routed through OpenRouter (not a hardcoded
single-provider SDK) so the model/provider is a config choice, not a code
change; see [CLAUDE.md](CLAUDE.md)'s Tech Stack and Observability sections.

## Requirements & Acceptance Criteria

| Requirement | Acceptance Criteria |
|---|---|
| Upload CRM/call/prescription data | Accepts CSV/XLSX; validates schema before processing; rejects malformed files with a clear reason |
| Calculate KPIs | Reach/frequency/coverage/attainment are reproducible from raw input by an independent spot-check |
| Compare territories | Side-by-side territory view using the same metric definitions applied uniformly |
| Analyze HCP trends | Trend direction (up/flat/down) requires a minimum sample size; sparse cases are flagged, never silently ranked |
| Produce rep rankings | Methodology is documented and inspectable; ties resolved by a stated rule; ranking never uses a field disallowed by [GOVERNANCE.md](GOVERNANCE.md) §4 |
| Compliant recommendations | Every recommendation cites the metric(s) it is based on; no unsupported or off-label promotional language passes review |
| Chatbot | Every chatbot answer that cites a number traces to a computed KPI value — never a model-invented figure |

## Data Readiness

Fields to normalize before analysis: rep ID/name, HCP ID, territory code,
product, call date, call outcome, prescription/volume, and target.
Data-quality checks required before KPI computation:

- Duplicate call records (same rep/HCP/date)
- Missing or zero targets (breaks attainment math — flag, don't divide by zero)
- Inconsistent territory codes (aliasing/typos across source systems)
- Sparse samples (HCPs/territories with too few data points for a stable trend or ranking)

## Governance & Compliance Summary

Full policy in [GOVERNANCE.md](GOVERNANCE.md). Headline constraints: HCP
data is sensitive and access is role-scoped by territory; rankings must be
fair, reproducible, and protected by minimum-sample thresholds; the system
never generates off-label or unsupported promotional claims; no
HCP-identifying or row-level data ever reaches OpenRouter (or any external
LLM provider) — only minimized, aggregated slices; human review is
mandatory before any output feeds a consequential decision (compensation,
discipline, territory reassignment, promotional claims, or regulatory
submissions). These rules are enforced by the skills, hooks, and guardrails
defined in [CLAUDE.md](CLAUDE.md) — not by prompting alone.

## High-Level Architecture

```
CRM/files → validation & normalization → KPI engine → territory/HCP analytics
  → ranking & recommendation engine → Claude assistant → dashboard/chatbot
```

Agent responsibilities, orchestration, and context-isolation rules are
defined in [CLAUDE.md](CLAUDE.md).

## Out of Scope (this phase)

- No production CRM/data-warehouse connection (a governed MCP connection is a later, explicit decision — see CLAUDE.md)
- No compensation, discipline, or territory-reassignment automation
- No patient-level, diagnosis, or dosage content of any kind
- No production deployment — this phase produces the problem definition, conventions, and guardrails only; application code follows in a later stage

## Definition of Done (this phase)

1. This document, [CLAUDE.md](CLAUDE.md), and [GOVERNANCE.md](GOVERNANCE.md) are reviewed and accepted by Commercial Excellence and Compliance stakeholders.
2. KPI definitions, ranking rules, and compliant-language boundaries are unambiguous enough for an engineer to implement without guessing.
3. Every data field and governance rule above maps to a concrete check in the eventual test suite (see the Testing sections of [CLAUDE.md](CLAUDE.md)).
