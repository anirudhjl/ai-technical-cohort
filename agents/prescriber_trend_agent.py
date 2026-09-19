from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from analytics.prescriber_trends import HCPTrend, classify_trend


@dataclass(frozen=True)
class HCPTrendReport:
    hcp_id: str
    territory_code: str
    trend: HCPTrend


def analyze_hcp_trends(df: pd.DataFrame) -> list[HCPTrendReport]:
    """Prescriber Trend Agent: splits each HCP's calls into the early vs. late
    half of the date range present in `df` and classifies engagement
    direction. Orchestrates the pandas grouping/date-split only - the actual
    classification rule lives in the pure analytics/prescriber_trends.py
    function, per GOVERNANCE.md #4's minimum-sample rule: sparse HCPs are
    flagged, never given a ranked/confident trend.
    """
    reports: list[HCPTrendReport] = []
    for hcp_id, group in df.groupby("hcp_id"):
        territory_code = str(group["territory_code"].iloc[0])
        dates = pd.to_datetime(group["call_date"])
        midpoint = dates.min() + (dates.max() - dates.min()) / 2
        early_volume = float(group.loc[dates <= midpoint, "volume"].sum())
        late_volume = float(group.loc[dates > midpoint, "volume"].sum())

        trend = classify_trend(early_volume, late_volume, total_calls=len(group))
        reports.append(HCPTrendReport(hcp_id=hcp_id, territory_code=territory_code, trend=trend))
    return reports
