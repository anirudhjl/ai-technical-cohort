import pandas as pd
import pytest

from agents.data_profiler_agent import profile_and_normalize
from analytics.normalization import SchemaValidationError


def _rows(**overrides):
    base = {
        "rep_id": ["R1", "R1"],
        "rep_name": ["Alice", "Alice"],
        "hcp_id": ["H1", "H2"],
        "territory_code": ["NE01", "Northeast"],
        "product": ["A", "A"],
        "call_date": ["2026-01-01", "2026-01-02"],
        "call_outcome": ["completed", "completed"],
        "volume": [10, 10],
        "target": [100, 100],
    }
    base.update(overrides)
    return pd.DataFrame(base)


def test_profile_and_normalize_normalizes_territory_aliases():
    normalized, report = profile_and_normalize(_rows())
    assert list(normalized["territory_code"]) == ["NE", "NE"]
    assert report.schema_ok is True
    assert report.duplicate_rows_removed == 0
    assert report.row_count == 2


def test_profile_and_normalize_dedups_exact_duplicate():
    df = _rows()
    df = pd.concat([df, df.iloc[[0]]], ignore_index=True)
    _, report = profile_and_normalize(df)
    assert report.duplicate_rows_removed == 1
    assert report.row_count == 2


def test_profile_and_normalize_rejects_missing_columns():
    df = _rows().drop(columns=["target"])
    with pytest.raises(SchemaValidationError):
        profile_and_normalize(df)


def test_profile_and_normalize_rejects_empty_file():
    with pytest.raises(SchemaValidationError):
        profile_and_normalize(_rows().iloc[0:0])
