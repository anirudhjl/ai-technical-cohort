"""Streamlit UI for the Pharma Shipment Risk Analyzer. No business logic here."""
import plotly.express as px
import streamlit as st

from risk import (
    MissingColumnsError,
    build_recommendation,
    compute_risk_score,
    load_shipments,
    top_n_risky,
)

st.set_page_config(page_title="Pharma Shipment Risk Analyzer", layout="wide")
st.title("Pharma Shipment Risk Analyzer")
st.caption(
    "Upload a shipment-level Excel file to see high-risk and temperature-excursion "
    "shipments. Advisory only — not a regulatory or quality-disposition tool."
)

uploaded_file = st.file_uploader("Upload shipment Excel file (.xlsx)", type=["xlsx"])

if uploaded_file is None:
    st.info("Upload an .xlsx file to get started.")
    st.stop()


@st.cache_data(show_spinner="Parsing shipments...")
def _load_and_score(file_bytes: bytes):
    from io import BytesIO

    df = load_shipments(BytesIO(file_bytes))
    return compute_risk_score(df)


try:
    scored = _load_and_score(uploaded_file.getvalue())
except MissingColumnsError as e:
    st.error(str(e))
    st.stop()
except Exception as e:
    st.error(f"Could not read this file: {e}")
    st.stop()

col1, col2, col3 = st.columns(3)
col1.metric("Total shipments", len(scored))
col2.metric("High-risk shipments", int(scored["high_risk"].sum()))
col3.metric("Temperature excursions", int(scored["temp_excursion"].sum()))

st.subheader("Top 5 highest-risk shipments")
top5 = top_n_risky(scored, 5)
st.dataframe(
    top5[
        [
            "shipment_id",
            "origin",
            "destination",
            "product",
            "risk_score",
            "temp_excursion",
            "high_risk",
        ]
    ],
    use_container_width=True,
    hide_index=True,
)

st.subheader("Risk distribution")
fig = px.histogram(
    scored,
    x="risk_score",
    nbins=20,
    color="high_risk",
    color_discrete_map={True: "#D64545", False: "#4A7CB5"},
    labels={"risk_score": "Risk score", "high_risk": "High risk"},
)
fig.add_vline(x=50, line_dash="dash", line_color="gray", annotation_text="High-risk threshold")
fig.update_layout(bargap=0.05)
st.plotly_chart(fig, use_container_width=True)

st.subheader("Recommendation")
st.info(build_recommendation(scored))
