from __future__ import annotations

from dataclasses import asdict

import pandas as pd
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError

from agents.coverage_kpi_agent import RepKPIs, TerritoryKPIs, compute_rep_kpis, compute_territory_kpis
from agents.data_profiler_agent import profile_and_normalize
from agents.prescriber_trend_agent import analyze_hcp_trends
from agents.qa_test_agent import GovernanceViolation
from agents.qa_test_agent import validate as qa_validate_output
from agents.ranking_recommendation_agent import build_rankings_and_recommendation
from agents.territory_analyst_agent import compare_territories as territory_analyst_compare
from analytics.kpis import AttainmentResult
from analytics.normalization import SchemaValidationError
from recommendation.recommend import Evidence

server = MCPServer("pharma-field-force-analytics")


def _rows_to_df(rows: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    for col in ("territory_code", "rep_id", "hcp_id"):
        if col in df.columns:
            df[col] = df[col].astype(str)
    return df


def _attainment_from_dict(d: dict) -> AttainmentResult:
    return AttainmentResult(ratio=d.get("ratio"), flagged=d["flagged"], reason=d.get("reason"))


def _territory_kpis_from_dicts(dicts: list[dict]) -> list[TerritoryKPIs]:
    return [
        TerritoryKPIs(
            territory_code=d["territory_code"],
            reach=d["reach"],
            frequency=d["frequency"],
            coverage=d["coverage"],
            call_productivity=d["call_productivity"],
            attainment=_attainment_from_dict(d["attainment"]),
        )
        for d in dicts
    ]


def _rep_kpis_from_dicts(dicts: list[dict]) -> list[RepKPIs]:
    return [
        RepKPIs(
            rep_id=d["rep_id"],
            territory_code=d["territory_code"],
            call_count=d["call_count"],
            coverage_pct=d["coverage_pct"],
            attainment=_attainment_from_dict(d["attainment"]),
        )
        for d in dicts
    ]


def _evidence_from_dicts(dicts: list[dict]) -> list[Evidence]:
    return [Evidence(metric=d["metric"], value=d["value"], territory_code=d["territory_code"], period=d["period"]) for d in dicts]


@server.tool()
def profile_and_normalize_data(rows: list[dict]) -> dict:
    """Sales Data Profiler: validate schema, normalize territory codes, dedup calls."""
    try:
        df = _rows_to_df(rows)
        normalized, report = profile_and_normalize(df)
    except (SchemaValidationError, ValueError) as exc:
        raise ToolError(str(exc)) from exc
    return {"rows": normalized.to_dict(orient="records"), "quality_report": asdict(report)}


@server.tool()
def compute_territory_kpis_tool(rows: list[dict], target_hcp_universe: dict[str, int], period_days: int = 30) -> dict:
    """Coverage KPI Agent: reach/frequency/coverage/call-productivity/attainment per territory.

    Wraps the list in a dict (rather than returning it bare) because the MCP
    SDK serializes a top-level list return into one content block per item -
    a single dict return always serializes as exactly one JSON text block, so
    the client-side unwrap has no item-count ambiguity to handle.
    """
    try:
        df = _rows_to_df(rows)
        results = compute_territory_kpis(df, target_hcp_universe, period_days)
    except ValueError as exc:
        raise ToolError(str(exc)) from exc
    return {"territories": [asdict(r) for r in results]}


@server.tool()
def compute_rep_kpis_tool(rows: list[dict], hcp_universe: dict[str, int]) -> dict:
    """Coverage KPI Agent: coverage/attainment/call_count per rep."""
    try:
        df = _rows_to_df(rows)
        results = compute_rep_kpis(df, hcp_universe)
    except ValueError as exc:
        raise ToolError(str(exc)) from exc
    return {"reps": [asdict(r) for r in results]}


@server.tool()
def compare_territories(territory_kpis: list[dict]) -> dict:
    """Territory Analyst: ranks/annotates the Coverage KPI Agent's territory output."""
    kpis = _territory_kpis_from_dicts(territory_kpis)
    return {"comparisons": [asdict(c) for c in territory_analyst_compare(kpis)]}


@server.tool()
def analyze_prescriber_trends(rows: list[dict]) -> dict:
    """Prescriber Trend Agent: per-HCP engagement trend (rising/flat/declining/insufficient_data)."""
    try:
        df = _rows_to_df(rows)
        reports = analyze_hcp_trends(df)
    except ValueError as exc:
        raise ToolError(str(exc)) from exc
    return {"trends": [asdict(r) for r in reports]}


@server.tool()
def rank_and_recommend(rep_kpis: list[dict], period: str) -> dict:
    """Ranking/Recommendation Agent: rep ranking + recommendation for the top eligible rep."""
    kpis = _rep_kpis_from_dicts(rep_kpis)
    ranked, recommendation = build_rankings_and_recommendation(kpis, period)
    return {
        "ranking": [asdict(r) for r in ranked],
        "recommendation": asdict(recommendation) if recommendation is not None else None,
    }


@server.tool()
def qa_validate(text: str, evidence: list[dict], allowed_identifiers: list[str] | None = None) -> dict:
    """QA/Test Agent: the last gate before any output ships. Returns a verdict
    rather than raising, so a policy violation is ordinary data to the caller,
    not a transport-level error.
    """
    try:
        qa_validate_output(text, _evidence_from_dicts(evidence), tuple(allowed_identifiers or ()))
    except GovernanceViolation as exc:
        return {"ok": False, "reason": str(exc)}
    return {"ok": True, "reason": None}


if __name__ == "__main__":
    server.run()
