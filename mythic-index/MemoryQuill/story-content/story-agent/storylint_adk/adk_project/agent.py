from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from storylint_adk.agents.orchestrator import build_orchestrator_agent

root_agent = build_orchestrator_agent(model="gemini-3-flash-preview")
