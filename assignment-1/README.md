# Pharma Shipment Risk Analyzer

A small Streamlit application for scoring and reviewing pharmaceutical shipment risk from an uploaded Excel file.

## Overview

This project analyzes shipment-level data and identifies shipments that are at elevated risk based on:

- temperature excursions outside the required range
- transit delay relative to expected transit time
- carrier risk score

It calculates a composite risk score on a 0–100 scale and highlights the highest-risk shipments in the uploaded batch.

## Features

- Upload an `.xlsx` shipment file
- Validate required columns before processing
- Flag temperature excursions
- Compute a weighted risk score for each shipment
- Identify high-risk shipments using a threshold of 50
- Display top 5 risky shipments
- Show a histogram of the risk score distribution
- Generate a simple operational recommendation summary

## Project structure

```text
assignment-1/
├── app.py                 # Streamlit UI and dashboard
├── risk.py                # Core risk-scoring logic and validation
├── requirements.txt       # Python dependencies
├── tests/
│   └── test_risk.py       # Unit tests for scoring and validation
├── CLAUDE.md              # Assignment guidance and workflow notes
└── README.md              # Project documentation
```

## Expected input data

The uploaded Excel file must include these columns:

- `shipment_id`
- `origin`
- `destination`
- `product`
- `temp_min_c`
- `temp_max_c`
- `temp_required_min_c`
- `temp_required_max_c`
- `transit_hours`
- `expected_transit_hours`
- `carrier_risk_score`

Column names are normalized to lowercase and spaces are converted to underscores, so values like `Temp Min (C)` are accepted after normalization.

If required columns are missing, the app raises a clear `MissingColumnsError` instead of failing silently.

## Risk scoring logic

The composite risk score is calculated as:

- temperature excursion: 50 points
- delay component: 30 points
- carrier risk score component: 20 points

The logic is implemented in `risk.py` and is kept separate from the UI so it stays easy to test and audit.

## Installation

From the `assignment-1` directory:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run the app

```bash
streamlit run app.py
```

Then open the local Streamlit URL in your browser and upload a shipment Excel file.

## Run tests

```bash
pytest -q
```

This verifies the scoring, empty-data handling, and missing-column validation behavior.

## Notes

- This tool is intended for operational awareness only.
- It is not a regulatory, quality-disposition, or medical decision tool.
- Recommendations are deterministic and generated from the uploaded dataset rather than relying on external AI calls.

## Example use case

Use this app to review a cold-chain logistics export and quickly identify:

- which shipments had temperature excursions
- which lanes are most delayed
- which shipments exceeded the high-risk threshold
- which shipments should be prioritized for investigation
