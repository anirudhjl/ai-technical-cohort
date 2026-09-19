from __future__ import annotations

from dataclasses import dataclass

from analytics.kpis import AttainmentResult
from recommendation.ranking import RankedRep


@dataclass(frozen=True)
class Evidence:
    metric: str
    value: float | int | str
    territory_code: str
    period: str


@dataclass(frozen=True)
class Recommendation:
    rep_id: str
    text: str
    evidence: list[Evidence]


def build_recommendation(
    rep: RankedRep, coverage_pct: float, attainment: AttainmentResult, period: str
) -> Recommendation:
    """Deterministic, template-based recommendation text. Commercial/operational
    language only (coverage, call frequency, territory focus) - never clinical
    or promotional product claims. Every sentence cites the metric(s) behind it.
    """
    if rep.insufficient_data:
        text = (
            f"Insufficient call data for rep {rep.rep_id} in {period} to produce a ranked "
            f"recommendation. Reporting descriptive coverage only: {coverage_pct:.0%} coverage."
        )
        evidence = [Evidence(metric="coverage", value=coverage_pct, territory_code=rep.territory_code, period=period)]
        return Recommendation(rep_id=rep.rep_id, text=text, evidence=evidence)

    evidence = [
        Evidence(metric="rank", value=rep.rank, territory_code=rep.territory_code, period=period),
        Evidence(metric="coverage", value=coverage_pct, territory_code=rep.territory_code, period=period),
    ]

    if attainment.flagged:
        text = (
            f"Rep {rep.rep_id} ranks #{rep.rank} in {rep.territory_code} for {period}, with "
            f"{coverage_pct:.0%} HCP coverage. Target attainment could not be computed "
            f"({attainment.reason}); focus on closing the coverage gap first."
        )
        return Recommendation(rep_id=rep.rep_id, text=text, evidence=evidence)

    evidence.append(Evidence(metric="target_attainment", value=attainment.ratio, territory_code=rep.territory_code, period=period))
    text = (
        f"Rep {rep.rep_id} ranks #{rep.rank} in {rep.territory_code} for {period}, with "
        f"{coverage_pct:.0%} HCP coverage and {attainment.ratio:.0%} target attainment. "
        f"Recommend increasing call frequency in under-covered HCP segments to close the "
        f"remaining coverage gap."
    )
    return Recommendation(rep_id=rep.rep_id, text=text, evidence=evidence)
