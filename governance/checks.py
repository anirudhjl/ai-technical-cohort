from __future__ import annotations

import re
from typing import Iterable

OFF_LABEL_PHRASES = [
    "off-label", "off label", "unapproved use", "guaranteed cure",
    "clinically proven to cure", "safe and effective for", "recommended dosage",
    "increase the dose", "efficacy of", "better outcomes than", "superior to placebo",
    "cures", "treats patients with",
]

NUMBER_TOKEN = re.compile(r"\d+(?:\.\d+)?%?")


class GovernanceViolation(ValueError):
    """Raised to BLOCK an output - never just a warning."""


def off_label_check(text: str) -> None:
    lowered = text.lower()
    for phrase in OFF_LABEL_PHRASES:
        if phrase in lowered:
            raise GovernanceViolation(f"blocked disallowed phrase: '{phrase}'")


def _number_variants(value: object) -> set[str]:
    if isinstance(value, bool) or value is None:
        return set()
    if isinstance(value, (int, float)):
        variants = {f"{value:.0f}", f"{value:.1f}", f"{value:.2f}", str(value)}
        if isinstance(value, float):
            # Ratios (e.g. attainment) are rendered as percentages, including
            # over-100% values for over-target performance - cover both forms.
            pct = value * 100
            variants |= {f"{pct:.0f}", f"{pct:.1f}"}
        return variants
    return {str(value)}


def evidence_check(text: str, evidence: Iterable, allowed_identifiers: Iterable[str] = ()) -> None:
    """Blocks any output that cites a number not traceable to a supplied Evidence
    record. `allowed_identifiers` covers non-metric strings that legitimately
    contain digits (e.g. a rep_id like "R201") so they aren't mistaken for an
    uncited figure.
    """
    evidence = list(evidence)
    if not evidence:
        raise GovernanceViolation("output cites no evidence records")

    allowed: set[str] = set()
    for item in evidence:
        allowed |= _number_variants(item.value)
        allowed |= set(NUMBER_TOKEN.findall(str(item.period)))
        allowed |= set(NUMBER_TOKEN.findall(str(item.territory_code)))
    for ident in allowed_identifiers:
        allowed |= set(NUMBER_TOKEN.findall(str(ident)))

    for token in NUMBER_TOKEN.findall(text):
        bare = token.rstrip("%")
        if token not in allowed and bare not in allowed:
            raise GovernanceViolation(f"number '{token}' in output is not traceable to any cited evidence")
