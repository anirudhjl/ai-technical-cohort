"""Reconciliation check: computed KPIs/ranking/trends vs. the hand-computed
golden dataset expectations, run through both the direct-function-call path
and the real MCP tool-call path (proving MCP wiring doesn't change a single
number). Run on every change to KPI, ranking, or agent-boundary logic.

    python evals/run_eval.py
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agents.coverage_kpi_agent import RepKPIs, TerritoryKPIs, compute_rep_kpis, compute_territory_kpis
from agents.data_profiler_agent import profile_and_normalize
from agents.prescriber_trend_agent import analyze_hcp_trends
from agents.ranking_recommendation_agent import build_rankings_and_recommendation
from agents.territory_analyst_agent import compare_territories
from backend.mcp_client import call_tool_json, open_session
from evals.expected_results import (
    EXPECTED_HCP_TRENDS,
    EXPECTED_INSUFFICIENT_TREND_HCPS,
    EXPECTED_RANKING,
    EXPECTED_REP_METRICS,
    EXPECTED_TERRITORY_COMPARISON,
    EXPECTED_TERRITORY_KPIS,
    PERIOD_DAYS,
    REP_HCP_UNIVERSE,
    TARGET_HCP_UNIVERSE,
)

TOLERANCE = 1e-6


def _check(label: str, actual: float, expected: float, failures: list[str]) -> None:
    if abs(actual - expected) > TOLERANCE:
        failures.append(f"{label}: expected {expected}, got {actual}")


def _check_direct(df: pd.DataFrame, failures: list[str]) -> tuple[list[TerritoryKPIs], list[RepKPIs]]:
    territory_kpis = {t.territory_code: t for t in compute_territory_kpis(df, TARGET_HCP_UNIVERSE, PERIOD_DAYS)}
    for territory_code, expected in EXPECTED_TERRITORY_KPIS.items():
        actual = territory_kpis[territory_code]
        _check(f"{territory_code}.reach", actual.reach, expected["reach"], failures)
        _check(f"{territory_code}.frequency", actual.frequency, expected["frequency"], failures)
        _check(f"{territory_code}.coverage", actual.coverage, expected["coverage"], failures)
        _check(f"{territory_code}.attainment", actual.attainment.ratio, expected["attainment_ratio"], failures)
        _check(f"{territory_code}.call_productivity", actual.call_productivity, expected["call_productivity"], failures)

    comparisons = {c.territory_code: c for c in compare_territories(list(territory_kpis.values()))}
    for territory_code, expected in EXPECTED_TERRITORY_COMPARISON.items():
        actual = comparisons[territory_code]
        if actual.coverage_rank != expected["coverage_rank"]:
            failures.append(f"{territory_code}.coverage_rank: expected {expected['coverage_rank']}, got {actual.coverage_rank}")
        _check(f"{territory_code}.coverage_vs_average_pp", actual.coverage_vs_average_pp, expected["coverage_vs_average_pp"], failures)

    rep_kpis = compute_rep_kpis(df, REP_HCP_UNIVERSE)
    rep_kpis_by_id = {r.rep_id: r for r in rep_kpis}
    for rep_id, expected in EXPECTED_REP_METRICS.items():
        actual = rep_kpis_by_id[rep_id]
        _check(f"{rep_id}.call_count", actual.call_count, expected["call_count"], failures)
        _check(f"{rep_id}.coverage_pct", actual.coverage_pct, expected["coverage_pct"], failures)

    ranked, _ = build_rankings_and_recommendation(rep_kpis, period="2026-01")
    ranked_by_id = {r.rep_id: r for r in ranked}
    for rep_id, expected_rank in EXPECTED_RANKING.items():
        if ranked_by_id[rep_id].rank != expected_rank:
            failures.append(f"{rep_id}.rank: expected {expected_rank}, got {ranked_by_id[rep_id].rank}")
    for rep_id, expected in EXPECTED_REP_METRICS.items():
        _check(f"{rep_id}.score", ranked_by_id[rep_id].score, expected["score"], failures)

    trends = {t.hcp_id: t.trend for t in analyze_hcp_trends(df)}
    for hcp_id, expected_direction in EXPECTED_HCP_TRENDS.items():
        actual_direction = trends[hcp_id].direction
        if actual_direction != expected_direction:
            failures.append(f"{hcp_id}.trend: expected {expected_direction}, got {actual_direction}")
    for hcp_id in EXPECTED_INSUFFICIENT_TREND_HCPS:
        actual_direction = trends[hcp_id].direction
        if actual_direction != "insufficient_data":
            failures.append(f"{hcp_id}.trend: expected insufficient_data, got {actual_direction}")

    return list(territory_kpis.values()), rep_kpis


async def _mcp_results(rows: list[dict]) -> tuple[dict, dict]:
    async with open_session() as session:
        territory_result = await call_tool_json(
            session, "compute_territory_kpis_tool", {"rows": rows, "target_hcp_universe": TARGET_HCP_UNIVERSE, "period_days": PERIOD_DAYS}
        )
        rep_result = await call_tool_json(session, "compute_rep_kpis_tool", {"rows": rows, "hcp_universe": REP_HCP_UNIVERSE})
    return territory_result, rep_result


def _check_mcp_parity(
    df: pd.DataFrame, direct_territories: list[TerritoryKPIs], direct_reps: list[RepKPIs], failures: list[str]
) -> None:
    """Drives the same normalized rows through the real MCP tool-call path
    and asserts it reproduces the direct-function-call results exactly -
    proving the MCP transport boundary changes no number.
    """
    territory_result, rep_result = asyncio.run(_mcp_results(df.to_dict(orient="records")))

    mcp_territories = {t["territory_code"]: t for t in territory_result["territories"]}
    for expected in direct_territories:
        actual = mcp_territories[expected.territory_code]
        label = f"mcp.{expected.territory_code}"
        _check(f"{label}.reach", actual["reach"], expected.reach, failures)
        _check(f"{label}.frequency", actual["frequency"], expected.frequency, failures)
        _check(f"{label}.coverage", actual["coverage"], expected.coverage, failures)
        _check(f"{label}.call_productivity", actual["call_productivity"], expected.call_productivity, failures)
        _check(f"{label}.attainment", actual["attainment"]["ratio"], expected.attainment.ratio, failures)

    mcp_reps = {r["rep_id"]: r for r in rep_result["reps"]}
    for expected in direct_reps:
        actual = mcp_reps[expected.rep_id]
        label = f"mcp.{expected.rep_id}"
        _check(f"{label}.call_count", actual["call_count"], expected.call_count, failures)
        _check(f"{label}.coverage_pct", actual["coverage_pct"], expected.coverage_pct, failures)
        _check(f"{label}.attainment", actual["attainment"]["ratio"], expected.attainment.ratio, failures)


def main() -> int:
    df = pd.read_csv(Path(__file__).parent / "golden_dataset.csv", dtype={"territory_code": str, "rep_id": str, "hcp_id": str})
    df, _ = profile_and_normalize(df)

    failures: list[str] = []
    direct_territories, direct_reps = _check_direct(df, failures)
    _check_mcp_parity(df, direct_territories, direct_reps, failures)

    if failures:
        print("EVAL FAILED:")
        for f in failures:
            print(f"  - {f}")
        return 1

    print("EVAL PASSED: computed KPIs, ranking, trends, and the MCP tool-call path all reconcile with the golden dataset.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
