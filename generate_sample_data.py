"""Generates sample_shipments.xlsx for local testing/demo purposes."""
import numpy as np
import pandas as pd

rng = np.random.default_rng(42)
n = 60

origins = ["Mumbai", "Basel", "Singapore", "Boston", "Hyderabad", "Frankfurt"]
destinations = ["New York", "London", "Tokyo", "Sao Paulo", "Lagos", "Sydney"]
products = ["Insulin", "mRNA Vaccine", "Monoclonal Antibody", "Oral Tablet", "Blood Plasma"]
carriers = ["FastFreight", "ColdChainX", "GlobalPharm Logistics", "AeroMed", "PolarShip"]

required_min = rng.choice([2, -20, 15], size=n)
required_max = required_min + rng.choice([8, 5, 10], size=n)

# Most shipments stay within range; ~20% get a deliberate excursion.
excursion = rng.random(n) < 0.2
recorded_min = required_min + np.where(excursion, rng.normal(-4, 1.5, size=n), rng.normal(1.5, 0.5, size=n))
recorded_max = required_max + np.where(excursion, rng.normal(4, 1.5, size=n), rng.normal(-1.5, 0.5, size=n))

expected_hours = rng.integers(24, 96, size=n)
delayed = rng.random(n) < 0.25
actual_hours = expected_hours + np.where(delayed, rng.integers(10, 40, size=n), rng.integers(-5, 5, size=n))

df = pd.DataFrame({
    "shipment_id": [f"SHP-{1000 + i}" for i in range(n)],
    "origin": rng.choice(origins, size=n),
    "destination": rng.choice(destinations, size=n),
    "product": rng.choice(products, size=n),
    "temp_min_c": recorded_min.round(1),
    "temp_max_c": recorded_max.round(1),
    "temp_required_min_c": required_min,
    "temp_required_max_c": required_max,
    "transit_hours": actual_hours,
    "expected_transit_hours": expected_hours,
    "carrier": rng.choice(carriers, size=n),
    "carrier_risk_score": rng.integers(5, 95, size=n),
})

df.to_excel("sample_shipments.xlsx", index=False)
print(f"Wrote sample_shipments.xlsx with {n} shipments")
