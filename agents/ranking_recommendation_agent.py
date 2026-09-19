from __future__ import annotations

from agents.coverage_kpi_agent import RepKPIs
from recommendation.ranking import RankedRep, rank_reps
from recommendation.recommend import Recommendation, build_recommendation


def _derive_score(rep: RepKPIs) -> float:
    """Ranking policy, not a KPI: how attainment maps to a ranking score is a
    Ranking/Recommendation Agent decision, kept separate from the Coverage
    KPI Agent's pure attainment computation.
    """
    return 0.0 if rep.attainment.flagged else rep.attainment.ratio


def build_rankings_and_recommendation(
    rep_kpis: list[RepKPIs], period: str
) -> tuple[list[RankedRep], Recommendation | None]:
    """Ranking/Recommendation Agent: produces rep rankings and a
    recommendation for the top eligible rep, strictly from the Coverage KPI
    Agent's output - no independent KPI calculation. Every recommendation
    cites the metric(s) behind it (see recommendation/recommend.py).
    """
    rep_metrics = [
        {
            "rep_id": r.rep_id,
            "territory_code": r.territory_code,
            "call_count": r.call_count,
            "score": _derive_score(r),
        }
        for r in rep_kpis
    ]
    ranked = rank_reps(rep_metrics)

    eligible = [r for r in ranked if not r.insufficient_data]
    if not eligible:
        return ranked, None

    top = min(eligible, key=lambda r: r.rank)
    top_kpis = next(r for r in rep_kpis if r.rep_id == top.rep_id)
    recommendation = build_recommendation(top, top_kpis.coverage_pct, top_kpis.attainment, period)
    return ranked, recommendation
