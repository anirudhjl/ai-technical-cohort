import pytest

from governance.checks import GovernanceViolation, evidence_check, off_label_check
from recommendation.recommend import Evidence


def _evidence(**overrides):
    base = {"metric": "coverage", "value": 0.45, "territory_code": "NE", "period": "2026-Q1"}
    base.update(overrides)
    return Evidence(**base)


def test_evidence_check_passes_when_number_matches_evidence():
    evidence_check("Coverage is 45% for NE.", [_evidence(value=0.45)])  # should not raise


def test_evidence_check_blocks_uncited_number():
    with pytest.raises(GovernanceViolation):
        evidence_check("Coverage is 99% for NE.", [_evidence(value=0.45)])


def test_evidence_check_blocks_when_no_evidence_given():
    with pytest.raises(GovernanceViolation):
        evidence_check("Coverage is 45% for NE.", [])


def test_evidence_check_allows_period_and_territory_digits():
    evidence = [_evidence(value=1, metric="rank", territory_code="NE01", period="2026-Q1")]
    evidence_check("Rep ranks #1 in NE01 for 2026-Q1.", evidence)  # should not raise


def test_evidence_check_blocks_rep_id_digits_unless_allowed():
    evidence = [_evidence(value=1, metric="rank")]
    with pytest.raises(GovernanceViolation):
        evidence_check("Rep R201 ranks #1.", evidence)
    evidence_check("Rep R201 ranks #1.", evidence, allowed_identifiers=("R201",))  # should not raise


@pytest.mark.parametrize("phrase", ["off-label use is fine here", "the recommended dosage is 10mg", "superior to placebo"])
def test_off_label_check_blocks_disallowed_phrases(phrase):
    with pytest.raises(GovernanceViolation):
        off_label_check(phrase)


def test_off_label_check_allows_commercial_language():
    off_label_check("Increase call frequency to close the coverage gap.")  # should not raise
