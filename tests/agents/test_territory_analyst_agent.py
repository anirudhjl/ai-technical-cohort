import pytest

from agents.coverage_kpi_agent import TerritoryKPIs
from agents.territory_analyst_agent import compare_territories
from analytics.kpis import AttainmentResult


def _territory(code, coverage):
    return TerritoryKPIs(
        territory_code=code,
        reach=coverage,
        frequency=1.0,
        coverage=coverage,
        call_productivity=1.0,
        attainment=AttainmentResult(ratio=1.0, flagged=False),
    )


def test_compare_territories_ranks_by_coverage_descending():
    kpis = [_territory("NE", 0.4), _territory("SW", 0.5), _territory("MW", 0.2)]
    comparisons = {c.territory_code: c for c in compare_territories(kpis)}
    assert comparisons["SW"].coverage_rank == 1
    assert comparisons["NE"].coverage_rank == 2
    assert comparisons["MW"].coverage_rank == 3


def test_compare_territories_ties_broken_by_territory_code_ascending():
    kpis = [_territory("SW", 0.5), _territory("NE", 0.5)]
    comparisons = {c.territory_code: c for c in compare_territories(kpis)}
    assert comparisons["NE"].coverage_rank == 1
    assert comparisons["SW"].coverage_rank == 2


def test_compare_territories_vs_average_pp():
    kpis = [_territory("NE", 0.4), _territory("SW", 0.6)]
    comparisons = {c.territory_code: c for c in compare_territories(kpis)}
    # average = 0.5: NE is 10pp below, SW is 10pp above
    assert comparisons["NE"].coverage_vs_average_pp == pytest.approx(-10.0)
    assert comparisons["SW"].coverage_vs_average_pp == pytest.approx(10.0)


def test_compare_territories_empty_input_returns_empty():
    assert compare_territories([]) == []
