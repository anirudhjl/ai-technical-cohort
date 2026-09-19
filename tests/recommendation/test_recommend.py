from analytics.kpis import AttainmentResult
from recommendation.ranking import RankedRep
from recommendation.recommend import build_recommendation


def test_build_recommendation_cites_rank_coverage_and_attainment():
    rep = RankedRep(rep_id="R1", territory_code="NE", score=0.8, rank=1, insufficient_data=False)
    attainment = AttainmentResult(ratio=0.8, flagged=False)
    rec = build_recommendation(rep, coverage_pct=0.6, attainment=attainment, period="2026-Q1")

    metrics_cited = {e.metric for e in rec.evidence}
    assert metrics_cited == {"rank", "coverage", "target_attainment"}
    assert "#1" in rec.text
    assert "60%" in rec.text
    assert "80%" in rec.text


def test_build_recommendation_insufficient_data_cites_coverage_only():
    rep = RankedRep(rep_id="R2", territory_code="NE", score=0.0, rank=None, insufficient_data=True)
    attainment = AttainmentResult(ratio=None, flagged=True, reason="missing_or_zero_target")
    rec = build_recommendation(rep, coverage_pct=0.2, attainment=attainment, period="2026-Q1")

    assert [e.metric for e in rec.evidence] == ["coverage"]
    assert "Insufficient call data" in rec.text
    assert "20%" in rec.text


def test_build_recommendation_flagged_attainment_does_not_cite_a_ratio():
    rep = RankedRep(rep_id="R3", territory_code="SW", score=0.0, rank=2, insufficient_data=False)
    attainment = AttainmentResult(ratio=None, flagged=True, reason="missing_or_zero_target")
    rec = build_recommendation(rep, coverage_pct=0.5, attainment=attainment, period="2026-Q1")

    metrics_cited = {e.metric for e in rec.evidence}
    assert metrics_cited == {"rank", "coverage"}
    assert "could not be computed" in rec.text
