from __future__ import annotations

from dataclasses import dataclass

MIN_SAMPLE_THRESHOLD = 5


@dataclass(frozen=True)
class RankedRep:
    rep_id: str
    territory_code: str
    score: float
    rank: int | None
    insufficient_data: bool


def rank_reps(rep_metrics: list[dict], min_sample: int = MIN_SAMPLE_THRESHOLD) -> list[RankedRep]:
    """Ranks reps by score descending. Ties are broken by rep_id ascending -
    the one documented tie rule, applied everywhere a ranking is produced.
    Reps below min_sample are flagged insufficient_data instead of ranked.
    """
    eligible = [m for m in rep_metrics if m["call_count"] >= min_sample]
    flagged = [m for m in rep_metrics if m["call_count"] < min_sample]

    eligible_sorted = sorted(eligible, key=lambda m: (-m["score"], m["rep_id"]))

    ranked = [
        RankedRep(rep_id=m["rep_id"], territory_code=m["territory_code"], score=m["score"], rank=idx, insufficient_data=False)
        for idx, m in enumerate(eligible_sorted, start=1)
    ]
    ranked += [
        RankedRep(rep_id=m["rep_id"], territory_code=m["territory_code"], score=m["score"], rank=None, insufficient_data=True)
        for m in flagged
    ]
    return ranked
