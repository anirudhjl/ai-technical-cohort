import pandas as pd
import pytest

from risk import (
    MissingColumnsError,
    compute_risk_score,
    flag_temperature_excursions,
    load_shipments,
    summary_stats,
    top_n_risky,
)


def make_df(**overrides):
    base = {
        "shipment_id": ["A", "B"],
        "origin": ["X", "Y"],
        "destination": ["P", "Q"],
        "product": ["Drug1", "Drug2"],
        "temp_min_c": [2, -10],
        "temp_max_c": [8, -5],
        "temp_required_min_c": [2, 2],
        "temp_required_max_c": [8, 8],
        "transit_hours": [24, 100],
        "expected_transit_hours": [24, 24],
        "carrier_risk_score": [10, 90],
    }
    base.update(overrides)
    return pd.DataFrame(base)


def test_flag_temperature_excursions():
    df = make_df()
    flags = flag_temperature_excursions(df)
    assert flags.tolist() == [False, True]


def test_compute_risk_score_high_risk_flagging():
    df = compute_risk_score(make_df())
    assert df.loc[1, "high_risk"]
    assert not df.loc[0, "high_risk"]


def test_top_n_risky_ordering():
    df = compute_risk_score(make_df())
    top1 = top_n_risky(df, 1)
    assert top1.iloc[0]["shipment_id"] == "B"


def test_summary_stats():
    df = compute_risk_score(make_df())
    stats = summary_stats(df)
    assert stats["total_shipments"] == 2
    assert stats["high_risk_count"] == 1
    assert stats["temp_excursion_count"] == 1


def test_load_shipments_missing_columns():
    bad_df = pd.DataFrame({"shipment_id": ["A"]})
    bad_df.to_excel("/tmp/bad.xlsx", index=False)
    with pytest.raises(MissingColumnsError):
        load_shipments("/tmp/bad.xlsx")


def test_compute_risk_score_empty_df():
    empty = make_df().iloc[0:0]
    scored = compute_risk_score(empty)
    stats = summary_stats(scored)
    assert stats["total_shipments"] == 0
