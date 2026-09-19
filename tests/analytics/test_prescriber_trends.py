import pytest

from analytics.prescriber_trends import HCP_TREND_MIN_SAMPLE, classify_trend


def test_classify_trend_rising():
    trend = classify_trend(early_volume=30, late_volume=60, total_calls=6)
    assert trend.direction == "rising"
    assert trend.early_volume == 30
    assert trend.late_volume == 60


def test_classify_trend_declining():
    trend = classify_trend(early_volume=60, late_volume=30, total_calls=6)
    assert trend.direction == "declining"


def test_classify_trend_flat_within_band():
    trend = classify_trend(early_volume=50, late_volume=52, total_calls=6)
    assert trend.direction == "flat"


def test_classify_trend_zero_average_is_flat():
    trend = classify_trend(early_volume=0, late_volume=0, total_calls=6)
    assert trend.direction == "flat"
    assert trend.early_volume == 0
    assert trend.late_volume == 0


def test_classify_trend_below_min_sample_is_insufficient_data():
    trend = classify_trend(early_volume=100, late_volume=0, total_calls=HCP_TREND_MIN_SAMPLE - 1)
    assert trend.direction == "insufficient_data"
    assert trend.early_volume is None
    assert trend.late_volume is None
    assert trend.reason == "below_min_sample"


def test_classify_trend_at_min_sample_boundary_is_classified():
    trend = classify_trend(early_volume=10, late_volume=10, total_calls=HCP_TREND_MIN_SAMPLE)
    assert trend.direction != "insufficient_data"


def test_classify_trend_invalid_negative_volume():
    with pytest.raises(ValueError):
        classify_trend(early_volume=-1, late_volume=10, total_calls=6)


def test_classify_trend_invalid_negative_calls():
    with pytest.raises(ValueError):
        classify_trend(early_volume=10, late_volume=10, total_calls=-1)
