"""Hand-computed expected values for evals/golden_dataset.csv.

NE: unique HCPs {H1,H2,H3} (R1) + {H4} (R2) = 4; 7 calls; universe=10
  reach/coverage = 4/10 = 0.4; frequency = 7/4 = 1.75
  target = R1(100) + R2(50) = 150; actual = 50 + 10 = 60; attainment = 0.4
  call_productivity = 7 calls / (2 reps * 30 days) = 7/60
SW: unique HCPs {H5..H9} = 5; 5 calls; universe=10
  reach/coverage = 5/10 = 0.5; frequency = 5/5 = 1.0
  target = 80; actual = 100; attainment = 1.25
  call_productivity = 5 / (1 * 30) = 5/30
MW: unique HCPs {H10} = 1; 6 calls; universe=5
  reach/coverage = 1/5 = 0.2; frequency = 6/1 = 6.0
  target = 100; actual = 90; attainment = 0.9
  call_productivity = 6 / (1 * 30) = 6/30

Territory comparison (Territory Analyst), ranked by coverage descending:
  average coverage = (0.4 + 0.5 + 0.2) / 3 = 11/30
  SW (0.5) rank 1, NE (0.4) rank 2, MW (0.2) rank 3

HCP trend (Prescriber Trend Agent): only H10 (R4's HCP) has >= HCP_TREND_MIN_SAMPLE(3)
calls. Its 6 calls split early (01-05..01-07, volume 30) vs. late (01-11..01-13,
volume 60) -> delta = (60-30)/45 = 0.667 > FLAT_BAND -> "rising". Every other HCP
in the dataset has 1-2 calls -> insufficient_data.
"""

TARGET_HCP_UNIVERSE = {"NE": 10, "SW": 10, "MW": 5}
REP_HCP_UNIVERSE = {"R1": 5, "R2": 5, "R3": 10, "R4": 4}
PERIOD_DAYS = 30

_AVERAGE_COVERAGE = (0.4 + 0.5 + 0.2) / 3

EXPECTED_TERRITORY_KPIS = {
    "NE": {"reach": 0.4, "frequency": 1.75, "coverage": 0.4, "attainment_ratio": 0.4, "call_productivity": 7 / 60},
    "SW": {"reach": 0.5, "frequency": 1.0, "coverage": 0.5, "attainment_ratio": 1.25, "call_productivity": 5 / 30},
    "MW": {"reach": 0.2, "frequency": 6.0, "coverage": 0.2, "attainment_ratio": 0.9, "call_productivity": 6 / 30},
}

EXPECTED_TERRITORY_COMPARISON = {
    "SW": {"coverage_rank": 1, "coverage_vs_average_pp": (0.5 - _AVERAGE_COVERAGE) * 100},
    "NE": {"coverage_rank": 2, "coverage_vs_average_pp": (0.4 - _AVERAGE_COVERAGE) * 100},
    "MW": {"coverage_rank": 3, "coverage_vs_average_pp": (0.2 - _AVERAGE_COVERAGE) * 100},
}

# R1: 5 calls, 3 unique HCPs, volume 50 / target 100 -> attainment 0.5, coverage 3/5=0.6
# R2: 2 calls (below min-sample 5) -> insufficient_data, never ranked
# R3: 5 calls, 5 unique HCPs, volume 100 / target 80 -> attainment 1.25, coverage 5/10=0.5
# R4: 6 calls, 1 unique HCP, volume 90 / target 100 -> attainment 0.9, coverage 1/4=0.25
EXPECTED_REP_METRICS = {
    "R1": {"call_count": 5, "score": 0.5, "coverage_pct": 0.6},
    "R2": {"call_count": 2, "score": 0.2, "coverage_pct": 0.2},
    "R3": {"call_count": 5, "score": 1.25, "coverage_pct": 0.5},
    "R4": {"call_count": 6, "score": 0.9, "coverage_pct": 0.25},
}

# Ranked by score descending, ties broken by rep_id ascending; R2 stays below
# MIN_SAMPLE_THRESHOLD(5) and is never ranked.
EXPECTED_RANKING = {"R3": 1, "R4": 2, "R1": 3, "R2": None}

EXPECTED_HCP_TRENDS = {"H10": "rising"}
EXPECTED_INSUFFICIENT_TREND_HCPS = {"H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8", "H9"}
