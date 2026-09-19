from __future__ import annotations

from dataclasses import dataclass

from agents.coverage_kpi_agent import TerritoryKPIs


@dataclass(frozen=True)
class TerritoryComparison:
    territory_code: str
    coverage: float
    coverage_rank: int
    coverage_vs_average_pp: float  # percentage points vs. the cross-territory average


def compare_territories(territory_kpis: list[TerritoryKPIs]) -> list[TerritoryComparison]:
    """Territory Analyst: compares territories using the Coverage KPI Agent's
    output only - no independent KPI calculation. Ranked by coverage
    descending, ties broken by territory_code ascending (the same
    documented tie rule used by recommendation/ranking.py::rank_reps).
    """
    if not territory_kpis:
        return []
    average_coverage = sum(t.coverage for t in territory_kpis) / len(territory_kpis)
    ordered = sorted(territory_kpis, key=lambda t: (-t.coverage, t.territory_code))
    return [
        TerritoryComparison(
            territory_code=t.territory_code,
            coverage=t.coverage,
            coverage_rank=idx,
            coverage_vs_average_pp=(t.coverage - average_coverage) * 100,
        )
        for idx, t in enumerate(ordered, start=1)
    ]
