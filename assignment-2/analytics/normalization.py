from __future__ import annotations

import pandas as pd

REQUIRED_COLUMNS = [
    "rep_id", "rep_name", "hcp_id", "territory_code", "product",
    "call_date", "call_outcome", "volume", "target",
]

DEFAULT_TERRITORY_ALIASES = {
    "NE01": "NE", "NORTHEAST": "NE", "NORTH": "NE",
    "SW01": "SW", "SOUTHWEST": "SW", "SOUTH": "SW",
    "MW01": "MW", "MIDWEST": "MW",
}


class SchemaValidationError(ValueError):
    pass


def validate_schema(df: pd.DataFrame) -> None:
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise SchemaValidationError(f"missing required columns: {missing}")
    if len(df) == 0:
        raise SchemaValidationError("uploaded file has no rows")


def normalize_territory_code(raw_code: str, alias_map: dict[str, str] | None = None) -> str:
    if raw_code is None or (isinstance(raw_code, float) and pd.isna(raw_code)):
        raise ValueError("territory code cannot be missing")
    cleaned = str(raw_code).strip().upper().replace(" ", "").replace("-", "").replace("_", "")
    if not cleaned:
        raise ValueError("territory code cannot be empty")
    active_map = alias_map if alias_map is not None else DEFAULT_TERRITORY_ALIASES
    return active_map.get(cleaned, cleaned)


def dedup_calls(df: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    key_cols = ["rep_id", "hcp_id", "call_date"]
    before = len(df)
    deduped = df.drop_duplicates(subset=key_cols, keep="first").reset_index(drop=True)
    removed = before - len(deduped)
    return deduped, removed
