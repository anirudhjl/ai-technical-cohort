from __future__ import annotations

from dataclasses import dataclass

# Below this many total calls, a direction can't be called reliably - flag
# instead of guessing (GOVERNANCE.md #4's minimum-sample rule, applied at
# HCP granularity rather than rep/territory granularity).
HCP_TREND_MIN_SAMPLE = 3

# Early vs. late volume within this band (as a fraction of their average) is
# "flat" rather than rising/declining - avoids reporting noise as a trend.
FLAT_BAND = 0.10


@dataclass(frozen=True)
class HCPTrend:
    direction: str  # "rising" | "flat" | "declining" | "insufficient_data"
    early_volume: float | None
    late_volume: float | None
    reason: str | None = None


def classify_trend(
    early_volume: float, late_volume: float, total_calls: int, min_sample: int = HCP_TREND_MIN_SAMPLE
) -> HCPTrend:
    """Pure, deterministic HCP engagement-trend classification. `early_volume`
    and `late_volume` are the summed prescription/call volume in the first vs.
    second half of the period under analysis.
    """
    if total_calls < 0 or early_volume < 0 or late_volume < 0:
        raise ValueError("calls and volumes cannot be negative")
    if total_calls < min_sample:
        return HCPTrend(direction="insufficient_data", early_volume=None, late_volume=None, reason="below_min_sample")

    average = (early_volume + late_volume) / 2
    if average == 0:
        return HCPTrend(direction="flat", early_volume=early_volume, late_volume=late_volume)

    delta = (late_volume - early_volume) / average
    if delta > FLAT_BAND:
        direction = "rising"
    elif delta < -FLAT_BAND:
        direction = "declining"
    else:
        direction = "flat"
    return HCPTrend(direction=direction, early_volume=early_volume, late_volume=late_volume)
