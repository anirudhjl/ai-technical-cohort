# Governance — Pharma Sales & Field Force Performance Analyzer

This document defines the non-negotiable data-governance, privacy, and
AI-governance rules for this project. All contributors (human and AI) must
follow these rules. See [PROBLEM_STATEMENT.md](PROBLEM_STATEMENT.md) for
business context and [CLAUDE.md](CLAUDE.md) for how these rules are
enforced in code.

## 1. Synthetic / De-Identified Data Only (development & demo)

Only synthetic or fully de-identified sample call/prescription/CRM data may
be used for development, testing, and demos. No production CRM export, real
prescriber data, or real rep performance data enters this repository or any
non-production environment without explicit written approval and a
documented data-use agreement.

## 2. HCP/Prescriber Data Protection

Prescriber (HCP) records are sensitive. Enforce:

- Role-based access: a Territory Manager sees only their assigned
  territory's HCPs; a Regional Manager sees only their region's
  territories; only Sales Head / Commercial Excellence roles see
  cross-territory data.
- No HCP-level data (identity, individual prescription volume) is ever
  exposed to an aggregate-only consumer (e.g. an executive-summary agent or
  a chatbot answering a cross-territory question) — see Context Isolation
  in [CLAUDE.md](CLAUDE.md).
- No HCP data is retained beyond the session unless there is an explicit,
  approved storage decision with an audit trail.

## 3. No Off-Label or Unsupported Promotional Content

The system analyzes field-force *performance*, not clinical efficacy. It
must never generate, infer, or surface:

- Off-label usage claims, dosing suggestions, or efficacy/safety claims for
  any product.
- Any "recommendation" phrased in a way that could be read as directing a
  rep to promote a product outside its approved label or indication.

All recommendation text is limited to commercial/operational language (call
frequency, coverage gaps, territory focus) — never clinical or promotional
product claims.

## 4. Fair, Transparent, and Reproducible Ranking

- Every rep/territory ranking must be traceable to an explicit, documented
  formula — no black-box scoring or hidden ML heuristic used for ranking.
- A **minimum sample-size threshold** applies before any HCP, rep, or
  territory is ranked; below threshold, the system reports "insufficient
  data" rather than a rank.
- Ties are resolved by a stated, consistent rule — never arbitrarily or by
  an LLM's discretion.
- Ranking inputs are limited to legitimate commercial-performance fields
  (calls, coverage, attainment, territory growth) — never a proxy field
  that could encode a protected characteristic of a rep.

## 5. Data Minimization & Context Isolation

Only fields necessary for KPI/ranking analysis are ingested or displayed:
rep ID, HCP ID, territory code, product, call date/outcome,
prescription/volume, and target. Extra columns in an uploaded file that
aren't used are dropped, not stored or shown. Each agent/context receives
only the slice of data (territory/product/time range, aggregate vs.
row-level) that its task requires — see [CLAUDE.md](CLAUDE.md)'s Context
Engineering section.

## 6. File & Data Validation

All uploaded/loaded files must be validated before use:

- Expected file type and size limits enforced.
- Required columns and types checked before processing.
- Duplicate call records, missing/zero targets, and inconsistent territory
  codes are detected and flagged, not silently guessed or dropped.
- File content is never executed, evaluated, or used to construct shell
  commands or queries.

## 7. Evidence & Audit Trail

Every KPI value, ranking, and recommendation must be traceable to the raw
data and calculation that produced it. Recommendation and chatbot outputs
that cite a number must log the evidence (which KPI, which time range,
which filter) behind that number — no output states a figure the system
cannot reproduce on demand.

## 8. Role-Based Access Control

Access to territory/rep/HCP-level data is enforced at the data layer, not
just the UI. A user (or an agent acting on their behalf) can never retrieve
data outside their authorized scope by rephrasing a chatbot question —
access checks apply before data reaches any agent or LLM context.

## 9. Human Review of Consequential Decisions

Any output that could inform a **consequential business decision** —
compensation, discipline, territory reassignment, hiring/firing, or a
promotional/regulatory claim — requires human (manager/compliance) review
before use. The system surfaces analysis and recommendations; it never
auto-triggers any HR, compensation, or promotional action.

## 10. Confidence & Fallback

Recommendations must disclose missing or sparse data rather than
presenting a confident answer on thin evidence. When confidence is
insufficient (small sample, high data-quality issues), the system falls
back to plain descriptive analytics and says so explicitly — it never
forces a ranking or recommendation to appear complete.

## 11. Red-Team & Misuse Testing

Before any release touching agents, ranking, or recommendation logic, test
for: HCP-data extraction via chatbot, unauthorized cross-territory access,
ranking manipulation (e.g. crafted input to inflate a rank), prompt
injection aimed at producing off-label/unsupported claims, and general tool
misuse. Findings block release until resolved.

## 12. Session & Storage Limits

Uploaded data is processed for the current session/analysis job only,
unless an explicit, approved storage decision exists. No silent persistence
of raw CRM/HCP data to disk, a database, or an external service without a
documented retention policy.

## 13. External LLM Provider (OpenRouter) Data Boundary

LLM calls are routed through OpenRouter. No HCP-identifying data and no
full row-level dataset may ever be sent to OpenRouter (or any external
model provider) — only the aggregated, minimized slice required for the
current question, exactly as required by §5. If the provider or model
behind OpenRouter changes, this boundary applies unchanged; it is a data
rule, not a vendor-specific one.

## 14. Enforcement via Skills, Hooks & Guardrails

These rules are not enforced by prompting alone. They are backed by the
skills, hooks, and guardrails defined in [CLAUDE.md](CLAUDE.md):
`upload-validation`, `hcp-territory-normalization`, `duplicate-call-check`,
`aggregation-reconciliation`, `tie-handling`, and `evidence-check` are
automated checks that block non-compliant output; the `sales-kpi-design`,
`coverage-analysis`, `territory-segmentation`, `prescriber-trends`, and
`recommendation-writing` skills define the single approved method each
agent must follow. Any change to a rule in this document requires a
corresponding change to the hook/skill that enforces it — a policy update
that isn't reflected in code isn't actually enforced.

## 15. Application Limitations Disclosure

The dashboard/chatbot must clearly communicate:

- This is a commercial-performance analytics aid, not a source of clinical,
  regulatory, or HR/compensation truth.
- Outputs depend entirely on the accuracy/completeness of the uploaded
  data.
- It does not replace compliance, HR, or commercial-excellence review
  processes.
