import pandas as pd

from agents.prescriber_trend_agent import analyze_hcp_trends


def _row(rep_id, hcp_id, territory_code, call_date, volume):
    return {"rep_id": rep_id, "hcp_id": hcp_id, "territory_code": territory_code, "call_date": call_date, "volume": volume}


def test_analyze_hcp_trends_classifies_rising_hcp():
    rows = [
        _row("R4", "H10", "MW", "2026-01-05", 10),
        _row("R4", "H10", "MW", "2026-01-06", 10),
        _row("R4", "H10", "MW", "2026-01-07", 10),
        _row("R4", "H10", "MW", "2026-01-11", 20),
        _row("R4", "H10", "MW", "2026-01-12", 20),
        _row("R4", "H10", "MW", "2026-01-13", 20),
    ]
    reports = {r.hcp_id: r for r in analyze_hcp_trends(pd.DataFrame(rows))}
    h10 = reports["H10"]
    assert h10.territory_code == "MW"
    assert h10.trend.direction == "rising"


def test_analyze_hcp_trends_flags_sparse_hcp_as_insufficient_data():
    rows = [
        _row("R1", "H1", "NE", "2026-01-01", 10),
        _row("R1", "H1", "NE", "2026-01-02", 10),
    ]
    reports = {r.hcp_id: r for r in analyze_hcp_trends(pd.DataFrame(rows))}
    assert reports["H1"].trend.direction == "insufficient_data"


def test_analyze_hcp_trends_handles_multiple_independent_hcps():
    rows = [
        _row("R1", "H1", "NE", "2026-01-01", 10),
        _row("R4", "H10", "MW", "2026-01-05", 10),
        _row("R4", "H10", "MW", "2026-01-06", 10),
        _row("R4", "H10", "MW", "2026-01-07", 10),
    ]
    reports = {r.hcp_id: r for r in analyze_hcp_trends(pd.DataFrame(rows))}
    assert reports["H1"].trend.direction == "insufficient_data"
    assert reports["H10"].trend.direction != "insufficient_data"
