# Pharma Shipment Risk Analyzer

## Purpose
A Streamlit app that lets a user upload a pharma supply-chain Excel file and
instantly see: total shipments, high-risk shipment count, temperature-excursion
count, a top-5 highest-risk table, a risk-distribution chart, and a short
AI-style recommendation.

## Tech Stack
- **Frontend/runtime**: Streamlit (single-page app, `st.file_uploader`).
- **Data**: pandas + openpyxl for Excel parsing.
- **Charting**: Plotly (interactive) — see `dataviz` skill for color/layout rules.
- **Deployment**: Streamlit Community Cloud, deployed from this repo's `main`
  branch; entrypoint `app.py`. Secrets (if any LLM key is used) go in
  Streamlit Cloud's Secrets manager, never committed.

## Layout
- `app.py` — UI: upload, layout, chart, recommendation panel. No business logic.
- `risk.py` — pure functions: load Excel → DataFrame, `compute_risk_score`,
  `flag_temperature_excursions`, `top_n_risky`. Fully unit-testable, no
  Streamlit imports.
- `tests/` — pytest coverage for `risk.py` scoring and edge cases (empty file,
  missing columns, all-safe shipments).
- `requirements.txt` — pinned versions.

## Data Assumptions
One row per shipment: shipment_id, origin, destination, product, temp_min/max
(recorded vs. required range), transit_time, carrier, status. Column matching
is case-insensitive. Missing required columns → explicit `st.error`, never a
silent crash or fabricated default.

## Risk Definition
High-risk = weighted combination of temperature excursion + delay + carrier
risk score, computed once in `compute_risk_score` so the formula stays
tunable and testable.

## Skills
- `pharma-risk-scoring` (project skill): encodes the exact risk-threshold and
  temperature-excursion definitions so every session — human or Claude —
  computes them identically. Load before touching `risk.py`.
- `dataviz`: load before writing/editing the risk-distribution chart; enforces
  accessible color and layout conventions.

## Subagents
Not used for routine app edits (single-file scope doesn't need coordination
overhead). Reserve for:
- A **data-validation** subagent when onboarding a new hospital/distributor
  Excel schema, to diff it against the expected column contract in isolation.
- A **code-review** subagent pass before deploying changes to the scoring
  formula, since a scoring bug directly changes which shipments get flagged.

## Hooks
- `PostToolUse` on edits to `risk.py`: run `pytest tests/ -q` automatically so
  a broken scoring function is caught before it's ever seen in the UI.
- `PreToolUse` guard on `git push`/deploy commands: block if `pytest` hasn't
  passed in the current session.

## Governance & Guardrails
- **No PHI/PII**: dataset is shipment-level logistics data only. If a column
  looks like patient or personal data, stop and flag it — do not process or
  display it.
- **Recommendations are advisory, not regulatory**: the "AI recommendation"
  panel is template-generated from computed stats, not a medical or
  compliance determination. Always label it "for operational awareness only —
  not a GxP/regulatory decision."
- **No live LLM calls on uploaded data** unless a key is explicitly configured
  by the user; default to deterministic, rule-based text generation so
  uploaded shipment data never leaves the deployed instance.
- **Reproducibility**: risk thresholds must be defined as named constants
  (not magic numbers) so an auditor can trace why a shipment was flagged.

## Conventions
- Keep functions small and side-effect-free outside `app.py`.
- No hardcoded file paths — always operate on the uploaded file object.
- Prefer `st.cache_data` for parsing to avoid recompute on every rerun.

## Out of Scope
Auth, persistence, multi-file comparison, and any write-back to source ERP/
distributor systems.
