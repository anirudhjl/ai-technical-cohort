from recommendation.ranking import rank_reps


def _metric(rep_id, territory_code, call_count, score):
    return {"rep_id": rep_id, "territory_code": territory_code, "call_count": call_count, "score": score}


def test_rank_reps_orders_by_score_descending():
    metrics = [
        _metric("R1", "NE", 10, 0.5),
        _metric("R2", "NE", 10, 0.9),
        _metric("R3", "NE", 10, 0.7),
    ]
    ranked = {r.rep_id: r.rank for r in rank_reps(metrics)}
    assert ranked == {"R1": 3, "R2": 1, "R3": 2}


def test_rank_reps_ties_broken_by_rep_id_ascending():
    metrics = [
        _metric("R2", "NE", 10, 0.5),
        _metric("R1", "NE", 10, 0.5),
    ]
    ranked = rank_reps(metrics)
    by_id = {r.rep_id: r.rank for r in ranked}
    # Equal scores: the documented tie rule breaks by rep_id ascending, so R1 outranks R2.
    assert by_id["R1"] == 1
    assert by_id["R2"] == 2


def test_rank_reps_below_min_sample_is_flagged_not_ranked():
    metrics = [
        _metric("R1", "NE", 10, 0.9),
        _metric("R2", "NE", 2, 0.99),  # highest score, but too few calls
    ]
    ranked = {r.rep_id: r for r in rank_reps(metrics, min_sample=5)}
    assert ranked["R2"].insufficient_data is True
    assert ranked["R2"].rank is None
    assert ranked["R1"].insufficient_data is False
    assert ranked["R1"].rank == 1


def test_rank_reps_all_below_threshold_returns_all_flagged():
    metrics = [_metric("R1", "NE", 1, 0.5), _metric("R2", "NE", 2, 0.9)]
    ranked = rank_reps(metrics, min_sample=5)
    assert all(r.insufficient_data for r in ranked)
    assert all(r.rank is None for r in ranked)
