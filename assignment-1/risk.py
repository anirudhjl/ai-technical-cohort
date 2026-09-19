"""Pure, testable risk-scoring logic for pharma shipments. No Streamlit here."""
from __future__ import annotations

import pandas as pd

REQUIRED_COLUMNS = [
    "shipment_id",
    "origin",
    "destination",
    "product",
    "temp_min_c",
    "temp_max_c",
    "temp_required_min_c",
    "temp_required_max_c",
    "transit_hours",
    "expected_transit_hours",
    "carrier_risk_score",
]

# Weights for the composite risk score (0-100 scale). Named constants so
# thresholds are auditable rather than magic numbers.
WEIGHT_TEMP_EXCURSION = 50
WEIGHT_DELAY = 30
WEIGHT_CARRIER = 20
HIGH_RISK_THRESHOLD = 50


class MissingColumnsError(ValueError):
    def __init__(self, missing: list[str]):
        self.missing = missing
        super().__init__(f"Missing required column(s): {', '.join(missing)}")


def load_shipments(file) -> pd.DataFrame:
    """Load an uploaded Excel file into a normalized DataFrame.

    Raises MissingColumnsError if required columns aren't present.
    """
    df = pd.read_excel(file)
    df.columns = [str(c).strip().lower().replace(" ", "_") for c in df.columns]

    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise MissingColumnsError(missing)

    return df


def flag_temperature_excursions(df: pd.DataFrame) -> pd.Series:
    """True where recorded temp fell outside the shipment's required range."""
    return (df["temp_min_c"] < df["temp_required_min_c"]) | (
        df["temp_max_c"] > df["temp_required_max_c"]
    )


def compute_risk_score(df: pd.DataFrame) -> pd.DataFrame:
    """Attach excursion flag, delay ratio, and a 0-100 composite risk_score."""
    df = df.copy()
    df["temp_excursion"] = flag_temperature_excursions(df)

    delay_ratio = (
        (df["transit_hours"] - df["expected_transit_hours"])
        / df["expected_transit_hours"].replace(0, pd.NA)
    ).clip(lower=0).fillna(0)
    delay_component = delay_ratio.clip(upper=1) * WEIGHT_DELAY

    carrier_component = (
        df["carrier_risk_score"].clip(lower=0, upper=100) / 100
    ) * WEIGHT_CARRIER

    temp_component = df["temp_excursion"].astype(int) * WEIGHT_TEMP_EXCURSION

    df["risk_score"] = (temp_component + delay_component + carrier_component).round(1)
    df["high_risk"] = df["risk_score"] >= HIGH_RISK_THRESHOLD
    return df


def top_n_risky(df: pd.DataFrame, n: int = 5) -> pd.DataFrame:
    return df.sort_values("risk_score", ascending=False).head(n)


def summary_stats(df: pd.DataFrame) -> dict:
    return {
        "total_shipments": len(df),
        "high_risk_count": int(df["high_risk"].sum()),
        "temp_excursion_count": int(df["temp_excursion"].sum()),
    }


def build_recommendation(df: pd.DataFrame) -> str:
    """Deterministic, template-generated recommendation. Advisory only —
    not a GxP/regulatory determination."""
    stats = summary_stats(df)
    if stats["total_shipments"] == 0:
        return "No shipments to analyze."

    high_pct = stats["high_risk_count"] / stats["total_shipments"] * 100
    lines = []

    if stats["high_risk_count"] == 0:
        lines.append("No shipments crossed the high-risk threshold this batch.")
    else:
        lines.append(
            f"{stats['high_risk_count']} of {stats['total_shipments']} shipments "
            f"({high_pct:.0f}%) are flagged high-risk — review the top-5 table below first."
        )

    if stats["temp_excursion_count"] > 0:
        top_carrier_series = df.loc[df["temp_excursion"], "carrier_risk_score"]
        lines.append(
            f"{stats['temp_excursion_count']} shipment(s) recorded a temperature "
            "excursion outside their required range — prioritize cold-chain audit "
            "for these lanes."
        )
    else:
        lines.append("No temperature excursions detected in this batch.")

    lines.append(
        "This is an operational-awareness summary only, not a regulatory or "
        "quality-disposition decision."
    )
    return " ".join(lines)
