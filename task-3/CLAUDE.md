# HCP Address Intelligence – Agent Instructions

## Objective
Capture, validate, standardize, deduplicate, and enrich Healthcare
Professional (HCP) address information from approved enterprise sources.

## Architecture
- Orchestrator coordinates specialized sub-agents.
- Agents must use approved Skills rather than implementing duplicate logic.
- External systems must be accessed through approved MCP tools.
- All material decisions must be recorded in the audit trail.

## Coding Standards
- TypeScript + Node.js
- Type hints required
- Unit tests required for business logic
- No hard-coded credentials or PII in logs
- Structured JSON logging
- Secrets retrieved only through approved secret-management mechanisms

## Business Rules
1. Never create an HCP master record solely from an unverified source.
2. Preserve the source system and source timestamp for every address.
3. Never overwrite an existing address without retaining history.
4. Address confidence must be calculated using defined validation rules.
5. Conflicting sources must be surfaced rather than silently resolved.
6. Human approval is required for material identity/address conflicts.
7. Agents must not infer missing HCP information without evidence.

## Data Privacy
- Process only approved HCP data.
- Minimize PII exposure.
- Mask sensitive data in logs.
- Apply role-based access control.
- Do not export data to unapproved systems.

## Guardrails
- No unsupported address generation.
- No autonomous modification of the golden HCP record.
- No access to unapproved databases.
- No action when identity confidence falls below threshold.

## Traceability
Every workflow must record:
request → plan → agent → skill → tool → evidence → decision →
guardrail check → human approval → final action.
