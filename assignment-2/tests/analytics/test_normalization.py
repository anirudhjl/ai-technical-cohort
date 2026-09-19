import pandas as pd
import pytest

from analytics.normalization import (
    SchemaValidationError,
    dedup_calls,
    normalize_territory_code,
    validate_schema,
)


def _valid_df() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "rep_id": ["R1", "R1"],
            "rep_name": ["Alice", "Alice"],
            "hcp_id": ["H1", "H2"],
            "territory_code": ["NE", "NE"],
            "product": ["A", "A"],
            "call_date": ["2026-01-01", "2026-01-02"],
            "call_outcome": ["completed", "completed"],
            "volume": [10, 10],
            "target": [100, 100],
        }
    )


def test_validate_schema_passes_for_complete_df():
    validate_schema(_valid_df())  # should not raise


def test_validate_schema_rejects_missing_columns():
    df = _valid_df().drop(columns=["target"])
    with pytest.raises(SchemaValidationError):
        validate_schema(df)


def test_validate_schema_rejects_empty_file():
    with pytest.raises(SchemaValidationError):
        validate_schema(_valid_df().iloc[0:0])


@pytest.mark.parametrize("raw", ["NE01", "Northeast", "north-east", " ne "])
def test_normalize_territory_code_aliases(raw):
    assert normalize_territory_code(raw) == "NE"


def test_normalize_territory_code_unknown_code_passes_through_cleaned():
    assert normalize_territory_code("east-99") == "EAST99"


def test_normalize_territory_code_rejects_missing():
    with pytest.raises(ValueError):
        normalize_territory_code(None)


def test_dedup_calls_removes_exact_duplicate_rep_hcp_date():
    df = _valid_df()
    df = pd.concat([df, df.iloc[[0]]], ignore_index=True)  # duplicate first row
    deduped, removed = dedup_calls(df)
    assert removed == 1
    assert len(deduped) == 2


def test_dedup_calls_keeps_distinct_rows():
    deduped, removed = dedup_calls(_valid_df())
    assert removed == 0
    assert len(deduped) == 2
