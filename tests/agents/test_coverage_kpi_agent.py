import pandas as pd
import pytest

from agents.coverage_kpi_agent import compute_rep_kpis, compute_territory_kpis


def _df(rows):
    return pd.DataFrame(rows)


def test_compute_territory_kpis_normal():
    rows = [
        {"rep_id": "R1", "hcp_id": "H1", "territory_code": "NE", "volume": 10, "target": 100},
        {"rep_id": "R1", "hcp_id": "H2", "territory_code": "NE", "volume": 10, "target": 100},
    ]
    results = {r.territory_code: r for r in compute_territory_kpis(_df(rows), {"NE": 10}, period_days=30)}
    ne = results["NE"]
    assert ne.reach == pytest.approx(0.2)
    assert ne.frequency == pytest.approx(1.0)
    assert ne.coverage == pytest.approx(0.2)
    assert ne.attainment.ratio == pytest.approx(0.2)
    assert ne.attainment.flagged is False


def test_compute_territory_kpis_zero_target_is_flagged_not_raised():
    rows = [{"rep_id": "R1", "hcp_id": "H1", "territory_code": "NE", "volume": 10, "target": 0}]
    results = {r.territory_code: r for r in compute_territory_kpis(_df(rows), {"NE": 10})}
    assert results["NE"].attainment.flagged is True
    assert results["NE"].attainment.ratio is None


def test_compute_territory_kpis_falls_back_to_observed_universe_when_unlisted():
    rows = [{"rep_id": "R1", "hcp_id": "H1", "territory_code": "ZZ", "volume": 10, "target": 100}]
    results = {r.territory_code: r for r in compute_territory_kpis(_df(rows), {})}
    # No universe entry for ZZ - falls back to the observed unique-HCP count (1), so reach=1.0
    assert results["ZZ"].reach == pytest.approx(1.0)


def test_compute_rep_kpis_normal():
    rows = [
        {"rep_id": "R1", "hcp_id": "H1", "territory_code": "NE", "volume": 10, "target": 100},
        {"rep_id": "R1", "hcp_id": "H2", "territory_code": "NE", "volume": 10, "target": 100},
    ]
    results = {r.rep_id: r for r in compute_rep_kpis(_df(rows), {"R1": 4})}
    r1 = results["R1"]
    assert r1.call_count == 2
    assert r1.coverage_pct == pytest.approx(0.5)
    assert r1.attainment.ratio == pytest.approx(0.2)


def test_compute_rep_kpis_single_call_hcp_boundary():
    rows = [{"rep_id": "R2", "hcp_id": "H9", "territory_code": "SW", "volume": 5, "target": 50}]
    results = {r.rep_id: r for r in compute_rep_kpis(_df(rows), {"R2": 1})}
    r2 = results["R2"]
    assert r2.call_count == 1
    assert r2.coverage_pct == pytest.approx(1.0)
