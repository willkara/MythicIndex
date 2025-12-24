from __future__ import annotations

import asyncio
from uuid import uuid4

try:
    from google.adk.runners import Runner
    from google.adk.sessions import InMemorySessionService
    from google.genai import types
except ImportError as exc:  # pragma: no cover - optional dependency for runtime
    raise RuntimeError("google-adk is not installed. Install with: pip install google-adk") from exc


async def run_agent_prompt(agent, prompt: str, user_id: str = "storylint") -> str:
    session_service = InMemorySessionService()
    session_id = uuid4().hex
    await session_service.create_session(app_name=agent.name, user_id=user_id, session_id=session_id)
    runner = Runner(agent=agent, app_name=agent.name, session_service=session_service)

    message = types.Content(role="user", parts=[types.Part(text=prompt)])
    async for event in runner.run_async(user_id=user_id, session_id=session_id, new_message=message):
        if event.is_final_response() and event.content:
            return event.content.parts[0].text
    raise RuntimeError("No final response received from agent.")


def run_agent_prompt_sync(agent, prompt: str, user_id: str = "storylint") -> str:
    return asyncio.run(run_agent_prompt(agent, prompt, user_id=user_id))
