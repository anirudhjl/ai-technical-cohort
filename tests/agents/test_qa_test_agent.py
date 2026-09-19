import pytest

from agents.qa_test_agent import GovernanceViolation, validate
from recommendation.recommend import Evidence


def _evidence(metric="coverage", value=0.5, territory_code="NE", period="2026-01"):
    return [Evidence(metric=metric, value=value, territory_code=territory_code, period=period)]


def test_validate_passes_for_traceable_text():
    validate("NE has 50% coverage in 2026-01.", _evidence(value=0.5))  # should not raise


def test_validate_blocks_uncited_number():
    with pytest.raises(GovernanceViolation):
        validate("NE has 99% coverage in 2026-01.", _evidence(value=0.5))


def test_validate_blocks_off_label_phrase():
    with pytest.raises(GovernanceViolation):
        validate("Coverage reached 50% in NE; this drug cures patients.", _evidence(value=0.5))


def test_validate_allows_identifier_digits_via_allowlist():
    # Regression: a rep/HCP id like "R201" contains digits that the uncited-
    # number check would otherwise flag - allowed_identifiers exists for this.
    validate("Rep R201 achieved 50% coverage in 2026-01.", _evidence(value=0.5), allowed_identifiers=("R201",))


def test_validate_blocks_identifier_digits_without_allowlist():
    with pytest.raises(GovernanceViolation):
        validate("Rep R201 achieved 50% coverage in 2026-01.", _evidence(value=0.5))
