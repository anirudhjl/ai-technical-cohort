import pytest

from analytics.kpis import (
    call_productivity,
    coverage,
    frequency,
    reach,
    target_attainment,
    territory_growth,
)


def test_reach_normal():
    assert reach(40, 100) == pytest.approx(0.4)


def test_reach_invalid_negative_universe():
    with pytest.raises(ValueError):
        reach(5, 0)


def test_reach_invalid_negative_calls():
    with pytest.raises(ValueError):
        reach(-1, 100)


def test_frequency_normal():
    assert frequency(10, 5) == pytest.approx(2.0)


def test_frequency_single_call_hcp_boundary():
    # A single-call HCP still yields a valid, unremarkable frequency.
    assert frequency(1, 1) == pytest.approx(1.0)


def test_frequency_invalid_zero_hcps():
    with pytest.raises(ValueError):
        frequency(5, 0)


def test_coverage_normal():
    assert coverage(30, 100) == pytest.approx(0.3)


def test_coverage_invalid_negative_touched():
    with pytest.raises(ValueError):
        coverage(-1, 100)


def test_call_productivity_normal():
    assert call_productivity(60, 30) == pytest.approx(2.0)


def test_call_productivity_invalid_zero_days():
    with pytest.raises(ValueError):
        call_productivity(10, 0)


def test_target_attainment_normal():
    result = target_attainment(80, 100)
    assert result.flagged is False
    assert result.ratio == pytest.approx(0.8)


def test_target_attainment_zero_target_is_flagged_not_raised():
    result = target_attainment(80, 0)
    assert result.flagged is True
    assert result.ratio is None
    assert result.reason == "missing_or_zero_target"


def test_target_attainment_invalid_negative_actual():
    with pytest.raises(ValueError):
        target_attainment(-1, 100)


def test_territory_growth_normal():
    result = territory_growth(120, 100)
    assert result.flagged is False
    assert result.ratio == pytest.approx(0.2)


def test_territory_growth_zero_prior_and_zero_current():
    result = territory_growth(0, 0)
    assert result.flagged is False
    assert result.ratio == 0.0


def test_territory_growth_zero_prior_nonzero_current_is_flagged():
    result = territory_growth(50, 0)
    assert result.flagged is True
    assert result.ratio is None


def test_territory_growth_invalid_negative_volume():
    with pytest.raises(ValueError):
        territory_growth(-5, 100)
