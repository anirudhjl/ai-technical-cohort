from __future__ import annotations

from dataclasses import dataclass


def reach(unique_hcps_called: int, target_hcp_universe: int) -> float:
    if target_hcp_universe <= 0:
        raise ValueError("target_hcp_universe must be positive")
    if unique_hcps_called < 0:
        raise ValueError("unique_hcps_called cannot be negative")
    return unique_hcps_called / target_hcp_universe


def frequency(total_calls: int, unique_hcps_called: int) -> float:
    if unique_hcps_called <= 0:
        raise ValueError("unique_hcps_called must be positive")
    if total_calls < 0:
        raise ValueError("total_calls cannot be negative")
    return total_calls / unique_hcps_called


def coverage(touched_hcps: int, target_hcp_list_size: int) -> float:
    if target_hcp_list_size <= 0:
        raise ValueError("target_hcp_list_size must be positive")
    if touched_hcps < 0:
        raise ValueError("touched_hcps cannot be negative")
    return touched_hcps / target_hcp_list_size


def call_productivity(total_calls: int, rep_days: int, outcome_weight: float = 1.0) -> float:
    if rep_days <= 0:
        raise ValueError("rep_days must be positive")
    if total_calls < 0:
        raise ValueError("total_calls cannot be negative")
    return (total_calls / rep_days) * outcome_weight


@dataclass(frozen=True)
class AttainmentResult:
    ratio: float | None
    flagged: bool
    reason: str | None = None


def target_attainment(actual: float, target: float) -> AttainmentResult:
    # Missing/zero targets break the division - flagged as insufficient rather
    # than raised, since a zero target is expected real-world data, not a bug.
    if actual < 0:
        raise ValueError("actual cannot be negative")
    if target <= 0:
        return AttainmentResult(ratio=None, flagged=True, reason="missing_or_zero_target")
    return AttainmentResult(ratio=actual / target, flagged=False)


@dataclass(frozen=True)
class GrowthResult:
    ratio: float | None
    flagged: bool
    reason: str | None = None


def territory_growth(current_period_volume: float, prior_period_volume: float) -> GrowthResult:
    if current_period_volume < 0 or prior_period_volume < 0:
        raise ValueError("volumes cannot be negative")
    if prior_period_volume == 0:
        if current_period_volume == 0:
            return GrowthResult(ratio=0.0, flagged=False)
        return GrowthResult(ratio=None, flagged=True, reason="zero_prior_period_volume")
    return GrowthResult(ratio=(current_period_volume - prior_period_volume) / prior_period_volume, flagged=False)
