from agents.coverage_kpi_agent import RepKPIs
from agents.ranking_recommendation_agent import build_rankings_and_recommendation
from analytics.kpis import AttainmentResult


def _rep(rep_id, territory_code, call_count, coverage_pct, ratio, flagged=False, reason=None):
    return RepKPIs(
        rep_id=rep_id,
        territory_code=territory_code,
        call_count=call_count,
        coverage_pct=coverage_pct,
        attainment=AttainmentResult(ratio=ratio, flagged=flagged, reason=reason),
    )


def test_build_rankings_and_recommendation_normal():
    reps = [_rep("R1", "NE", 5, 0.6, 0.5), _rep("R3", "SW", 5, 0.5, 1.25)]
    ranked, recommendation = build_rankings_and_recommendation(reps, period="2026-01")
    ranked_by_id = {r.rep_id: r for r in ranked}
    assert ranked_by_id["R3"].rank == 1
    assert ranked_by_id["R1"].rank == 2
    assert recommendation is not None
    assert recommendation.rep_id == "R3"
    assert "R3" in recommendation.text
    metrics = {e.metric for e in recommendation.evidence}
    assert {"rank", "coverage", "target_attainment"} <= metrics


def test_build_rankings_and_recommendation_flagged_attainment_excluded_from_score():
    reps = [_rep("R1", "NE", 5, 0.6, None, flagged=True, reason="missing_or_zero_target")]
    ranked, recommendation = build_rankings_and_recommendation(reps, period="2026-01")
    assert ranked[0].score == 0.0
    assert recommendation is not None
    assert "could not be computed" in recommendation.text


def test_build_rankings_and_recommendation_all_insufficient_data_returns_no_recommendation():
    reps = [_rep("R2", "NE", 2, 0.2, 0.2)]
    ranked, recommendation = build_rankings_and_recommendation(reps, period="2026-01")
    assert ranked[0].insufficient_data is True
    assert recommendation is None
