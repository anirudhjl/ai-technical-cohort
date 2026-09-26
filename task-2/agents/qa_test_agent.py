from __future__ import annotations

from governance.checks import GovernanceViolation, evidence_check, off_label_check
from recommendation.recommend import Evidence


def validate(text: str, evidence: list[Evidence], allowed_identifiers: tuple[str, ...] = ()) -> None:
    """QA/Test Agent: the last gate before any ranking, recommendation, or
    chatbot answer reaches a user. Every other agent's output text must pass
    through this before it ships. Raises GovernanceViolation to BLOCK - never
    just a warning (CLAUDE.md: no hook/guardrail is advisory).
    """
    evidence_check(text, evidence, allowed_identifiers)
    off_label_check(text)


__all__ = ["validate", "GovernanceViolation"]
