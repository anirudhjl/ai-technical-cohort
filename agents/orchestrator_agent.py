from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from backend.llm_client import LLMClient, LLMResult
from recommendation.recommend import Evidence

REPHRASE_SYSTEM_PROMPT = (
    "You rephrase pharma commercial field-force metrics into one clear, professional "
    "sentence for a sales manager. Use ONLY the numbers given to you - never invent a "
    "number. Never mention dosing, off-label use, drug efficacy, or promoting a product "
    "outside its approved use. Stay strictly to call activity, coverage, and targets."
)


class ToolCaller(Protocol):
    """Abstraction over 'call an MCP tool by name'. `backend.mcp_client.SessionToolCaller`
    is the real, stdio-subprocess-backed implementation used by the UI; tests
    inject a fake in-process caller instead, so no test here needs a subprocess.
    """

    async def call(self, name: str, arguments: dict[str, Any]) -> Any: ...


@dataclass(frozen=True)
class AccessScope:
    role: str
    territory_codes: tuple[str, ...] | None  # None = cross-territory (Sales Head / Comm. Excellence)


@dataclass(frozen=True)
class ChatAnswer:
    text: str
    citations: list[Evidence]
    path: str


class GovernanceBlockedError(RuntimeError):
    pass


def _in_scope(territory_code: str, scope: AccessScope) -> bool:
    return scope.territory_codes is None or territory_code in scope.territory_codes


def _scoped_rows(rows: list[dict], scope: AccessScope) -> list[dict]:
    return [r for r in rows if _in_scope(str(r["territory_code"]), scope)]


def _evidence_from_dicts(dicts: list[dict]) -> list[Evidence]:
    return [Evidence(metric=d["metric"], value=d["value"], territory_code=d["territory_code"], period=d["period"]) for d in dicts]


def _evidence_to_dicts(evidence: list[Evidence]) -> list[dict]:
    return [{"metric": e.metric, "value": e.value, "territory_code": e.territory_code, "period": e.period} for e in evidence]


async def answer_question(
    question: str,
    scope: AccessScope,
    rows: list[dict],
    target_hcp_universe: dict[str, int],
    rep_hcp_universe: dict[str, int],
    period: str,
    tool_caller: ToolCaller,
    llm_client: LLMClient,
) -> ChatAnswer:
    """Orchestrator: routes a chat question to the right MCP tool(s) - the
    routing decision itself stays deterministic Python, never an LLM choice,
    so "never let an LLM compute a KPI/ranking/score" holds even though tool
    calls are now in play. Every answer runs the QA/Test Agent's qa_validate
    tool, both before and after any LLM phrasing pass, before it can reach
    the caller. Only aggregated numbers are ever built into the LLM prompt.

    Scope filtering happens here, before any tool call, so a Territory
    Manager's tool calls never include another territory's rows - context
    isolation enforced at the data-access layer, not by prompting.
    """
    scoped_rows = _scoped_rows(rows, scope)
    if not scoped_rows:
        return ChatAnswer(text="No data in scope to answer.", citations=[], path="deterministic")

    question_lower = question.lower()
    if any(kw in question_lower for kw in ("rank", "recommend", "top", "best")):
        return await _answer_ranking(scoped_rows, rep_hcp_universe, period, tool_caller, llm_client)
    if "coverage" in question_lower:
        return await _answer_coverage(scoped_rows, target_hcp_universe, period, tool_caller, llm_client)
    if any(kw in question_lower for kw in ("attainment", "target")):
        return await _answer_attainment(scoped_rows, target_hcp_universe, period, tool_caller, llm_client)
    if any(kw in question_lower for kw in ("trend", "engagement", "rising", "declining", "prescriber")):
        return await _answer_trend(scoped_rows, tool_caller, llm_client)

    return ChatAnswer(
        text=(
            "I can answer questions about coverage, target attainment, rep ranking/"
            "recommendations, and HCP engagement trends for your authorized territories. "
            "Try asking about one of those."
        ),
        citations=[], path="deterministic",
    )


async def _answer_ranking(
    rows: list[dict], rep_hcp_universe: dict[str, int], period: str, tool_caller: ToolCaller, llm_client: LLMClient
) -> ChatAnswer:
    rep_kpis = (await tool_caller.call("compute_rep_kpis_tool", {"rows": rows, "hcp_universe": rep_hcp_universe}))["reps"]
    result = await tool_caller.call("rank_and_recommend", {"rep_kpis": rep_kpis, "period": period})
    recommendation = result["recommendation"]
    if recommendation is None:
        return ChatAnswer(
            text="Insufficient call-volume data across the reps in scope to produce a ranking.",
            citations=[], path="deterministic",
        )
    evidence = _evidence_from_dicts(recommendation["evidence"])
    return await _finalize(
        recommendation["text"], evidence, tool_caller, llm_client, allowed_identifiers=(recommendation["rep_id"],)
    )


async def _answer_coverage(
    rows: list[dict], target_hcp_universe: dict[str, int], period: str, tool_caller: ToolCaller, llm_client: LLMClient
) -> ChatAnswer:
    territory_kpis = (
        await tool_caller.call("compute_territory_kpis_tool", {"rows": rows, "target_hcp_universe": target_hcp_universe})
    )["territories"]
    if not territory_kpis:
        return ChatAnswer(text="No territory data in scope to answer.", citations=[], path="deterministic")
    lines = [f"{t['territory_code']}: {t['coverage']:.0%} coverage" for t in territory_kpis]
    text = f"Coverage by territory for {period} - " + "; ".join(lines) + "."
    evidence = [Evidence(metric="coverage", value=t["coverage"], territory_code=t["territory_code"], period=period) for t in territory_kpis]
    return await _finalize(text, evidence, tool_caller, llm_client)


async def _answer_attainment(
    rows: list[dict], target_hcp_universe: dict[str, int], period: str, tool_caller: ToolCaller, llm_client: LLMClient
) -> ChatAnswer:
    territory_kpis = (
        await tool_caller.call("compute_territory_kpis_tool", {"rows": rows, "target_hcp_universe": target_hcp_universe})
    )["territories"]
    if not territory_kpis:
        return ChatAnswer(text="No territory data in scope to answer.", citations=[], path="deterministic")
    parts: list[str] = []
    evidence: list[Evidence] = []
    for t in territory_kpis:
        attainment = t["attainment"]
        if attainment["flagged"]:
            parts.append(f"{t['territory_code']}: attainment unavailable ({attainment['reason']})")
        else:
            parts.append(f"{t['territory_code']}: {attainment['ratio']:.0%} attainment")
            evidence.append(Evidence(metric="target_attainment", value=attainment["ratio"], territory_code=t["territory_code"], period=period))
    text = f"Target attainment for {period} - " + "; ".join(parts) + "."
    if not evidence:
        return ChatAnswer(text=text, citations=[], path="deterministic")
    return await _finalize(text, evidence, tool_caller, llm_client)


async def _answer_trend(rows: list[dict], tool_caller: ToolCaller, llm_client: LLMClient) -> ChatAnswer:
    trends = (await tool_caller.call("analyze_prescriber_trends", {"rows": rows}))["trends"]
    reportable = [t for t in trends if t["trend"]["direction"] != "insufficient_data"]
    sparse_count = len(trends) - len(reportable)
    if not reportable:
        return ChatAnswer(
            text="Insufficient call-volume data for any HCP in scope to classify an engagement trend.",
            citations=[], path="deterministic",
        )

    counts: dict[str, int] = {}
    for t in reportable:
        counts[t["trend"]["direction"]] = counts.get(t["trend"]["direction"], 0) + 1

    # Every number that will appear in `text` gets its own Evidence entry -
    # including the aggregate reportable-count and the excluded-sparse-count -
    # so evidence_check has something to trace each one back to.
    evidence = [
        Evidence(metric=f"hcp_trend_{direction}_count", value=count, territory_code="ALL", period="n/a")
        for direction, count in counts.items()
    ]
    evidence.append(Evidence(metric="hcp_trend_classified_count", value=len(reportable), territory_code="ALL", period="n/a"))

    parts = [f"{count} {direction}" for direction, count in sorted(counts.items())]
    text = f"HCP engagement trend across {len(reportable)} prescriber(s) in scope: " + ", ".join(parts) + "."
    if sparse_count:
        evidence.append(Evidence(metric="hcp_trend_insufficient_data_count", value=sparse_count, territory_code="ALL", period="n/a"))
        text += f" {sparse_count} HCP(s) had too few calls to classify and were excluded."

    return await _finalize(text, evidence, tool_caller, llm_client)


async def _finalize(
    deterministic_text: str,
    evidence: list[Evidence],
    tool_caller: ToolCaller,
    llm_client: LLMClient,
    allowed_identifiers: tuple[str, ...] = (),
) -> ChatAnswer:
    evidence_dicts = _evidence_to_dicts(evidence)

    pre = await tool_caller.call(
        "qa_validate", {"text": deterministic_text, "evidence": evidence_dicts, "allowed_identifiers": list(allowed_identifiers)}
    )
    if not pre["ok"]:
        raise GovernanceBlockedError(pre["reason"])

    result: LLMResult = llm_client.rephrase(REPHRASE_SYSTEM_PROMPT, deterministic_text, fallback_text=deterministic_text)

    post = await tool_caller.call(
        "qa_validate", {"text": result.text, "evidence": evidence_dicts, "allowed_identifiers": list(allowed_identifiers)}
    )
    if not post["ok"]:
        result = LLMResult(text=deterministic_text, path="deterministic", fallback_reason="post_llm_governance_block")

    return ChatAnswer(text=result.text, citations=evidence, path=result.path)
