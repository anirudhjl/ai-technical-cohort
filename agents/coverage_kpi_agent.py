from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from analytics.kpis import AttainmentResult, call_productivity, coverage, frequency, reach, target_attainment


@dataclass(frozen=True)
class TerritoryKPIs:
    territory_code: str
    reach: float
    frequency: float
    coverage: float
    call_productivity: float
    attainment: AttainmentResult


@dataclass(frozen=True)
class RepKPIs:
    rep_id: str
    territory_code: str
    call_count: int
    coverage_pct: float
    attainment: AttainmentResult


def compute_territory_kpis(
    df: pd.DataFrame, target_hcp_universe: dict[str, int], period_days: int = 30
) -> list[TerritoryKPIs]:
    """Coverage KPI Agent: reach/frequency/coverage/call-productivity/target-
    attainment per territory, from already-normalized data. Deterministic KPI
    engine only - no LLM call, no cross-territory comparison (that is the
    Territory Analyst's job).
    """
    results: list[TerritoryKPIs] = []
    for territory_code, group in df.groupby("territory_code"):
        unique_hcps = int(group["hcp_id"].nunique())
        total_calls = len(group)
        rep_count = int(group["rep_id"].nunique())
        universe = target_hcp_universe.get(territory_code, unique_hcps)

        rep_targets = group.groupby("rep_id")["target"].max()
        target_volume = float(rep_targets.sum())
        actual_volume = float(group["volume"].sum())

        results.append(
            TerritoryKPIs(
                territory_code=territory_code,
                reach=reach(unique_hcps, universe),
                frequency=frequency(total_calls, unique_hcps),
                coverage=coverage(unique_hcps, universe),
                call_productivity=call_productivity(total_calls, rep_count * period_days),
                attainment=target_attainment(actual_volume, target_volume),
            )
        )
    return results


def compute_rep_kpis(df: pd.DataFrame, hcp_universe: dict[str, int]) -> list[RepKPIs]:
    """Coverage KPI Agent: per-rep coverage/attainment/call_count, from
    already-normalized data. Deterministic KPI engine only. Ranking-specific
    derivations (e.g. turning attainment into a ranking score) belong to the
    Ranking/Recommendation Agent, not here.
    """
    results: list[RepKPIs] = []
    for rep_id, group in df.groupby("rep_id"):
        territory_code = str(group["territory_code"].iloc[0])
        unique_hcps = int(group["hcp_id"].nunique())
        actual_volume = float(group["volume"].sum())
        target_volume = float(group["target"].max())
        universe = hcp_universe.get(rep_id, unique_hcps)

        results.append(
            RepKPIs(
                rep_id=rep_id,
                territory_code=territory_code,
                call_count=len(group),
                coverage_pct=coverage(unique_hcps, universe),
                attainment=target_attainment(actual_volume, target_volume),
            )
        )
    return results
