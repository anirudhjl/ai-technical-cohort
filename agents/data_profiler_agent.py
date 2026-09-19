from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from analytics.normalization import dedup_calls, normalize_territory_code, validate_schema


@dataclass(frozen=True)
class DataQualityReport:
    row_count: int
    duplicate_rows_removed: int
    schema_ok: bool


def profile_and_normalize(df: pd.DataFrame) -> tuple[pd.DataFrame, DataQualityReport]:
    """Sales Data Profiler: validates schema, normalizes territory codes, and
    de-duplicates call records. Reports data-quality issues; computes no KPIs.
    """
    validate_schema(df)
    normalized = df.copy()
    normalized["territory_code"] = normalized["territory_code"].map(normalize_territory_code)
    deduped, removed = dedup_calls(normalized)
    report = DataQualityReport(row_count=len(deduped), duplicate_rows_removed=removed, schema_ok=True)
    return deduped, report
