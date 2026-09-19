"""Orchestrator tests use a fake in-process ToolCaller that dispatches
straight to backend/mcp_server.py's plain functions (a @server.tool()
function is still directly callable) - full fidelity with the real MCP
tool-call path, minus the subprocess/wire round-trip. See
tests/backend/test_mcp_server.py for the real-subprocess counterpart that
proves the wire protocol itself.
"""
from __future__ import annotations

import asyncio

import backend.mcp_server as mcp_server
from agents.orchestrator_agent import AccessScope, answer_question
from backend.llm_client import NullLLMClient


class FakeToolCaller:
    async def call(self, name, arguments):
        func = getattr(mcp_server, name)
        return func(**arguments)


def _row(rep_id, hcp_id, territory_code, call_date, volume, target):
    return {"rep_id": rep_id, "hcp_id": hcp_id, "territory_code": territory_code, "call_date": call_date, "volume": volume, "target": target}


NE_ROWS = [
    _row("R1", "H1", "NE", "2026-01-01", 10, 100),
    _row("R1", "H2", "NE", "2026-01-02", 10, 100),
    _row("R1", "H3", "NE", "2026-01-03", 10, 100),
    _row("R1", "H1", "NE", "2026-01-10", 10, 100),
    _row("R1", "H2", "NE", "2026-01-11", 10, 100),
]
SW_ROWS = [
    _row("R3", "H5", "SW", "2026-01-01", 20, 80),
    _row("R3", "H6", "SW", "2026-01-02", 20, 80),
    _row("R3", "H7", "SW", "2026-01-03", 20, 80),
    _row("R3", "H8", "SW", "2026-01-04", 20, 80),
    _row("R3", "H9", "SW", "2026-01-05", 20, 80),
]
ALL_ROWS = NE_ROWS + SW_ROWS

TARGET_HCP_UNIVERSE = {"NE": 10, "SW": 10}
REP_HCP_UNIVERSE = {"R1": 5, "R3": 10}
PERIOD = "2026-01"

SALES_HEAD = AccessScope(role="sales_head", territory_codes=None)
NE_MANAGER = AccessScope(role="territory_manager", territory_codes=("NE",))


def _answer(question, scope, rows=ALL_ROWS):
    return asyncio.run(
        answer_question(
            question, scope, rows, TARGET_HCP_UNIVERSE, REP_HCP_UNIVERSE, PERIOD, FakeToolCaller(), NullLLMClient()
        )
    )


def test_answer_question_ranking_recommends_top_rep_across_territories():
    answer = _answer("Who should we recommend this month?", SALES_HEAD)
    assert "R3" in answer.text
    assert answer.path == "deterministic"
    assert any(e.metric == "rank" for e in answer.citations)


def test_answer_question_ranking_is_scoped_to_authorized_territory():
    # NE_MANAGER never sees R3/SW data - only R1 is in scope, so R1 gets recommended.
    answer = _answer("rank our reps", NE_MANAGER)
    assert "R1" in answer.text
    assert "R3" not in answer.text


def test_answer_question_coverage_reports_all_territories_in_scope():
    answer = _answer("what's our coverage this month?", SALES_HEAD)
    assert "NE" in answer.text and "SW" in answer.text
    assert "30%" in answer.text  # NE: 3 unique HCPs / universe 10
    assert "50%" in answer.text  # SW: 5 unique HCPs / universe 10


def test_answer_question_attainment_flags_missing_target():
    rows = ALL_ROWS + [_row("R4", "H10", "MW", "2026-01-01", 10, 0)]
    answer = _answer("target attainment status?", SALES_HEAD, rows=rows)
    assert "attainment unavailable" in answer.text
    assert "missing_or_zero_target" in answer.text


def test_answer_question_trend_classifies_reportable_hcp_and_excludes_sparse():
    rows = ALL_ROWS + [_row("R1", "H1", "NE", "2026-01-20", 10, 100)]  # gives H1 3 calls total
    answer = _answer("how is prescriber engagement trending?", SALES_HEAD, rows=rows)
    assert "1 declining" in answer.text
    assert "excluded" in answer.text  # every other HCP in scope stays sparse


def test_answer_question_no_data_in_scope():
    scoped = AccessScope(role="territory_manager", territory_codes=("ZZ",))
    answer = _answer("coverage?", scoped)
    assert answer.text == "No data in scope to answer."
    assert answer.citations == []


def test_answer_question_unrecognized_question_returns_help_text():
    answer = _answer("what's the weather like?", SALES_HEAD)
    assert "I can answer questions about" in answer.text
    assert answer.citations == []
