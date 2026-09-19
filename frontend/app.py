from __future__ import annotations

import asyncio
import logging
import sys
from pathlib import Path

import pandas as pd
import streamlit as st

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agents.orchestrator_agent import AccessScope, GovernanceBlockedError, ToolCaller, answer_question
from backend.config import load_config
from backend.llm_client import LLMClient, OpenRouterClient
from backend.mcp_client import MCPToolError, SessionToolCaller, open_session

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

SAMPLE_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "sample_calls.csv"
PERIOD = "2026-01/02 (sample period)"

# Demo-only assumption: the target HCP universe (the full list of HCPs a
# territory/rep is assigned to call) isn't a column in a CRM call export - it
# comes from a separate target-list reference table. Hardcoded here for this
# scaffolding-phase demo; a real deployment would load it from that table.
TERRITORY_HCP_UNIVERSE = {"NE": 8, "SW": 6, "MW": 6}
REP_HCP_UNIVERSE = {"R101": 5, "R102": 5, "R201": 5, "R202": 5, "R301": 4}

st.set_page_config(page_title="Pharma Field Force Analyzer", layout="wide")


@st.cache_resource
def get_llm_client():
    config = load_config()
    return OpenRouterClient(config), config


def _load_dataframe(uploaded_file) -> pd.DataFrame:
    dtype = {"territory_code": str, "rep_id": str, "hcp_id": str}
    if uploaded_file is not None:
        return pd.read_csv(uploaded_file, dtype=dtype)
    return pd.read_csv(SAMPLE_DATA_PATH, dtype=dtype)


def _resolve_scope(role: str, all_territories: list[str]) -> AccessScope:
    if role == "Territory Manager":
        territory_selection = st.sidebar.selectbox("Your territory", all_territories)
        return AccessScope(role=role, territory_codes=(territory_selection,))
    if role == "Regional Manager":
        default = all_territories[:2] or all_territories
        region_selection = st.sidebar.multiselect("Your region's territories", all_territories, default=default)
        return AccessScope(role=role, territory_codes=tuple(region_selection) or tuple(all_territories))
    return AccessScope(role=role, territory_codes=None)


def main() -> None:
    st.title("Pharma Sales & Field Force Performance Analyzer")
    st.caption(
        "Six-agent, local MCP-based build. Synthetic data only - see GOVERNANCE.md. "
        "Not a source of clinical, regulatory, or HR/compensation truth; outputs "
        "depend entirely on the accuracy of the uploaded data."
    )

    llm_client, config = get_llm_client()

    with st.sidebar:
        st.header("Session context")
        role = st.selectbox("Role", ["Territory Manager", "Regional Manager", "Sales Head / Comm. Excellence"])
        uploaded_file = st.file_uploader("Upload CRM/call CSV (optional)", type=["csv"])

        st.divider()
        if config.has_llm_key:
            st.success(f"OpenRouter key configured — model: {config.openrouter_model}")
        else:
            st.warning("No OPENROUTER_API_KEY set — chatbot answers use the deterministic fallback path only.")
        st.caption(
            "Agents reach the KPI/ranking/QA tools through a local MCP server "
            "subprocess (stdio, localhost-only) - internal IPC, not a third-party "
            "call. Only OpenRouter is external, and it only ever receives "
            "already-aggregated text, never row-level or HCP-identifying data."
        )

    asyncio.run(_render(uploaded_file, role, llm_client))


async def _render(uploaded_file, role: str, llm_client: LLMClient) -> None:
    raw_df = _load_dataframe(uploaded_file)

    async with open_session() as session:
        caller = SessionToolCaller(session)

        try:
            profiled = await caller.call("profile_and_normalize_data", {"rows": raw_df.to_dict(orient="records")})
        except MCPToolError as exc:  # upload-validation gate: reject and explain, never crash silently
            st.error(f"Upload rejected by validation: {exc}")
            return

        rows: list[dict] = profiled["rows"]
        quality_report = profiled["quality_report"]
        st.info(
            f"Data quality: {quality_report['row_count']} rows after de-duplication "
            f"({quality_report['duplicate_rows_removed']} duplicate call record(s) removed)."
        )

        all_territories = sorted({r["territory_code"] for r in rows})
        scope = _resolve_scope(role, all_territories)

        scoped_rows = [r for r in rows if scope.territory_codes is None or r["territory_code"] in scope.territory_codes]

        tab_kpis, tab_ranking, tab_trends, tab_chat = st.tabs(
            ["Territory KPIs", "Rep Ranking & Recommendation", "Prescriber Trends", "Chatbot"]
        )

        if not scoped_rows:
            for tab in (tab_kpis, tab_ranking, tab_trends):
                with tab:
                    st.warning("No data in scope for the selected role/territory.")
            with tab_chat:
                await render_chat_tab(scope, rows, PERIOD, caller, llm_client)
            return

        territory_kpis = (
            await caller.call("compute_territory_kpis_tool", {"rows": scoped_rows, "target_hcp_universe": TERRITORY_HCP_UNIVERSE})
        )["territories"]
        comparisons = (await caller.call("compare_territories", {"territory_kpis": territory_kpis}))["comparisons"]

        rep_kpis = (await caller.call("compute_rep_kpis_tool", {"rows": scoped_rows, "hcp_universe": REP_HCP_UNIVERSE}))["reps"]
        ranking_result = await caller.call("rank_and_recommend", {"rep_kpis": rep_kpis, "period": PERIOD})

        trends = (await caller.call("analyze_prescriber_trends", {"rows": scoped_rows}))["trends"]

        with tab_kpis:
            render_kpi_tab(territory_kpis, comparisons)
        with tab_ranking:
            await render_ranking_tab(rep_kpis, ranking_result, caller)
        with tab_trends:
            render_trends_tab(trends)
        with tab_chat:
            await render_chat_tab(scope, rows, PERIOD, caller, llm_client)


def render_kpi_tab(territory_kpis: list[dict], comparisons: list[dict]) -> None:
    st.subheader("Territory-level KPIs")
    if not territory_kpis:
        st.write("No territories in scope.")
        return
    rows = [
        {
            "Territory": t["territory_code"],
            "Reach": f"{t['reach']:.0%}",
            "Frequency (calls/HCP)": f"{t['frequency']:.2f}",
            "Coverage": f"{t['coverage']:.0%}",
            "Call productivity (calls/rep/day)": f"{t['call_productivity']:.2f}",
            "Target attainment": (
                "n/a - " + t["attainment"]["reason"] if t["attainment"]["flagged"] else f"{t['attainment']['ratio']:.0%}"
            ),
        }
        for t in territory_kpis
    ]
    st.dataframe(pd.DataFrame(rows), width="stretch", hide_index=True)
    st.caption(
        "Reach and coverage use the same target-HCP-universe denominator in this demo "
        "build (a real deployment would source distinct reach vs. coverage HCP lists)."
    )

    st.subheader("Territory comparison")
    if len(comparisons) < 2:
        st.caption("Need at least two territories in scope to compare.")
        return
    comparison_rows = [
        {
            "Territory": c["territory_code"],
            "Coverage rank": c["coverage_rank"],
            "Coverage": f"{c['coverage']:.0%}",
            "vs. average": f"{c['coverage_vs_average_pp']:+.1f}pp",
        }
        for c in sorted(comparisons, key=lambda c: c["coverage_rank"])
    ]
    st.dataframe(pd.DataFrame(comparison_rows), width="stretch", hide_index=True)


async def render_ranking_tab(rep_kpis: list[dict], ranking_result: dict, caller: ToolCaller) -> None:
    st.subheader("Rep ranking")
    ranking = ranking_result["ranking"]
    recommendation = ranking_result["recommendation"]
    if not ranking:
        st.write("No reps in scope.")
        return

    kpis_by_id = {r["rep_id"]: r for r in rep_kpis}
    rows = [
        {
            "Rep": r["rep_id"],
            "Territory": r["territory_code"],
            "Calls": kpis_by_id[r["rep_id"]]["call_count"],
            # Cast to str: rank_and_recommend already returns eligible reps
            # ascending by rank followed by flagged reps, so no re-sort is
            # needed here - but the column must be all-str (not a mix of int
            # and "insufficient data") or pyarrow fails to serialize it for
            # display.
            "Rank": str(r["rank"]) if not r["insufficient_data"] else "insufficient data",
            "Coverage": f"{kpis_by_id[r['rep_id']]['coverage_pct']:.0%}",
        }
        for r in ranking
    ]
    st.dataframe(pd.DataFrame(rows), width="stretch", hide_index=True)

    st.subheader("Recommendation for the top-ranked rep in scope")
    if recommendation is None:
        st.warning("Insufficient call-volume data across reps in scope to produce a ranked recommendation.")
        return

    # QA/Test Agent gate: every ranking/recommendation must pass this before it
    # ships, same as the Chatbot tab already required - closing the gap where
    # this tab used to show recommendation text with no QA check at all.
    qa = await caller.call(
        "qa_validate",
        {
            "text": recommendation["text"],
            "evidence": recommendation["evidence"],
            "allowed_identifiers": [recommendation["rep_id"]],
        },
    )
    if not qa["ok"]:
        st.error(f"🔴 QA/Test Agent BLOCKED this recommendation: {qa['reason']}")
        return

    st.write(recommendation["text"])
    st.caption("🟢 QA/Test Agent passed - evidence-check and off-label filter both cleared.")
    with st.expander("Evidence behind this recommendation"):
        for e in recommendation["evidence"]:
            st.write(f"- **{e['metric']}** = {e['value']} ({e['territory_code']}, {e['period']})")


def render_trends_tab(trends: list[dict]) -> None:
    st.subheader("Prescriber (HCP) engagement trends")
    if not trends:
        st.write("No HCPs in scope.")
        return

    reportable = [t for t in trends if t["trend"]["direction"] != "insufficient_data"]
    sparse_count = len(trends) - len(reportable)
    st.caption(
        f"{len(reportable)} HCP(s) classified; {sparse_count} HCP(s) had too few calls "
        f"(below the minimum-sample threshold) to classify reliably and were excluded "
        f"rather than forced into a trend."
    )

    rows = [
        {
            "HCP": t["hcp_id"],
            "Territory": t["territory_code"],
            "Trend": t["trend"]["direction"],
            "Early-period volume": t["trend"]["early_volume"],
            "Late-period volume": t["trend"]["late_volume"],
        }
        for t in trends
    ]
    st.dataframe(pd.DataFrame(rows), width="stretch", hide_index=True)


async def render_chat_tab(scope: AccessScope, rows: list[dict], period: str, caller: ToolCaller, llm_client: LLMClient) -> None:
    st.subheader("Ask about your authorized territories")
    st.caption('Try: "What\'s our coverage?", "target attainment", "who should we recommend?", or "prescriber trends"')
    question = st.text_input("Question")
    if not question:
        return
    try:
        answer = await answer_question(
            question, scope, rows, TERRITORY_HCP_UNIVERSE, REP_HCP_UNIVERSE, period, caller, llm_client
        )
    except GovernanceBlockedError as exc:
        st.error(f"Output blocked by governance check: {exc}")
        return

    badge = "🟢 LLM-phrased" if answer.path == "llm" else "⚪ deterministic fallback"
    st.write(answer.text)
    st.caption(badge)
    if answer.citations:
        with st.expander("Evidence behind this answer"):
            for c in answer.citations:
                st.write(f"- **{c.metric}** = {c.value} ({c.territory_code}, {c.period})")


if __name__ == "__main__":
    main()
