"""Integration test: spawns the real backend/mcp_server.py subprocess over
stdio and exercises all 7 tools through backend/mcp_client.py. This is the
one test in the suite that proves the actual MCP wire protocol works -
every agent-level test elsewhere uses a fake in-process ToolCaller instead.
Spawning a local subprocess over stdio is not network access, so this stays
inside CLAUDE.md's "no test depends on network access" rule.
"""
from __future__ import annotations

import asyncio

from backend.mcp_client import MCPToolError, call_tool_json, open_session


def _row(rep_id, hcp_id, territory_code, call_date, volume, target, rep_name="Alice", product="DrugA", call_outcome="completed"):
    return {
        "rep_id": rep_id, "rep_name": rep_name, "hcp_id": hcp_id, "territory_code": territory_code,
        "product": product, "call_date": call_date, "call_outcome": call_outcome, "volume": volume, "target": target,
    }


ROWS = [
    _row("R1", "H1", "NE01", "2026-01-01", 10, 100),
    _row("R1", "H2", "NE01", "2026-01-02", 10, 100),
    _row("R1", "H1", "NE01", "2026-01-01", 10, 100),  # exact duplicate of the first row
    _row("R3", "H5", "SW", "2026-01-01", 20, 80),
]


async def _run_all_tools():
    async with open_session() as session:
        profiled = await call_tool_json(session, "profile_and_normalize_data", {"rows": ROWS})
        normalized_rows = profiled["rows"]

        territories = await call_tool_json(
            session, "compute_territory_kpis_tool", {"rows": normalized_rows, "target_hcp_universe": {"NE": 10, "SW": 10}}
        )
        reps = await call_tool_json(
            session, "compute_rep_kpis_tool", {"rows": normalized_rows, "hcp_universe": {"R1": 5, "R3": 10}}
        )
        comparisons = await call_tool_json(session, "compare_territories", {"territory_kpis": territories["territories"]})
        trends = await call_tool_json(session, "analyze_prescriber_trends", {"rows": normalized_rows})
        ranking = await call_tool_json(session, "rank_and_recommend", {"rep_kpis": reps["reps"], "period": "2026-01"})
        qa_ok = await call_tool_json(
            session, "qa_validate",
            {"text": "NE: 40% coverage.", "evidence": [{"metric": "coverage", "value": 0.4, "territory_code": "NE", "period": "2026-01"}], "allowed_identifiers": []},
        )
        qa_bad = await call_tool_json(
            session, "qa_validate",
            {"text": "NE: 99% coverage.", "evidence": [{"metric": "coverage", "value": 0.4, "territory_code": "NE", "period": "2026-01"}], "allowed_identifiers": []},
        )

        return profiled, territories, reps, comparisons, trends, ranking, qa_ok, qa_bad


def test_all_mcp_tools_round_trip_over_stdio():
    profiled, territories, reps, comparisons, trends, ranking, qa_ok, qa_bad = asyncio.run(_run_all_tools())

    assert profiled["quality_report"]["duplicate_rows_removed"] == 1
    assert profiled["quality_report"]["schema_ok"] is True
    assert {r["territory_code"] for r in profiled["rows"]} == {"NE", "SW"}  # NE01 normalized to NE

    assert {t["territory_code"] for t in territories["territories"]} == {"NE", "SW"}

    assert {r["rep_id"] for r in reps["reps"]} == {"R1", "R3"}

    assert len(comparisons["comparisons"]) == 2

    assert {t["hcp_id"] for t in trends["trends"]} == {"H1", "H2", "H5"}

    assert len(ranking["ranking"]) == 2
    assert ranking["recommendation"] is None  # both reps below MIN_SAMPLE_THRESHOLD after dedup

    assert qa_ok["ok"] is True
    assert qa_bad["ok"] is False
    assert "99" in qa_bad["reason"]


def test_mcp_tool_error_surfaces_real_message_not_generic_text():
    # Catch inside the `async with` block, not letting it escape through
    # open_session()'s __aexit__ - an exception unwinding through the
    # stdio_client/ClientSession task groups gets wrapped in a
    # BaseExceptionGroup rather than propagating as a clean MCPToolError.
    async def _bad_call():
        async with open_session() as session:
            try:
                await call_tool_json(session, "profile_and_normalize_data", {"rows": [{"rep_id": "R1"}]})
            except MCPToolError as exc:
                return exc
        return None

    error = asyncio.run(_bad_call())
    assert isinstance(error, MCPToolError)
    assert "missing required columns" in str(error)
