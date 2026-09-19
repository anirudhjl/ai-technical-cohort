from __future__ import annotations

import json
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncIterator

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

_PROJECT_ROOT = Path(__file__).resolve().parent.parent


class MCPToolError(RuntimeError):
    """Raised when an MCP tool call returns an error result."""


@asynccontextmanager
async def open_session() -> AsyncIterator[ClientSession]:
    """Spawn backend/mcp_server.py as a stdio subprocess (same interpreter as
    this process, so it shares the venv) and yield one initialized
    ClientSession for the caller to issue tool calls through. One subprocess
    per call site - callers should make every tool call needed for a single
    unit of work inside one `open_session()` block rather than reopening it
    per call.
    """
    params = StdioServerParameters(
        command=sys.executable, args=["-m", "backend.mcp_server"], cwd=str(_PROJECT_ROOT)
    )
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            yield session


async def call_tool_json(session: ClientSession, name: str, arguments: dict[str, Any]) -> Any:
    """Call an MCP tool and unwrap its result into plain dict/list data.
    Raises MCPToolError if the tool call failed.
    """
    result = await session.call_tool(name, arguments)
    if result.is_error:
        message = result.content[0].text if result.content else f"tool {name} failed"
        raise MCPToolError(message)
    if not result.content:
        return None
    if len(result.content) != 1:
        # Every tool in mcp_server.py returns a single JSON object rather than
        # a bare list, specifically so exactly one content block comes back
        # (the SDK splits a top-level list return into one block per item).
        # More than one block means that invariant was violated - fail loudly
        # rather than silently dropping the extra blocks.
        raise MCPToolError(f"tool {name} returned {len(result.content)} content blocks, expected 1")
    return json.loads(result.content[0].text)


class SessionToolCaller:
    """Real `agents.orchestrator_agent.ToolCaller` implementation, backed by a
    live MCP ClientSession. Construct one per `open_session()` block.
    """

    def __init__(self, session: ClientSession) -> None:
        self._session = session

    async def call(self, name: str, arguments: dict[str, Any]) -> Any:
        return await call_tool_json(self._session, name, arguments)
