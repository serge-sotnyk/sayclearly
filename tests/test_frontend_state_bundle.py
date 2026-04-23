import json
import shutil
import subprocess
from pathlib import Path

import pytest


def _run_app_state(expression: str) -> dict[str, object]:
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node.js is required for frontend bundle state tests")

    module_uri = (
        Path(__file__).resolve().parents[1]
        / "src"
        / "sayclearly"
        / "static"
        / "dist"
        / "app_state.js"
    ).as_uri()
    script = (
        f"import('{module_uri}')"
        f".then((m) => {{ const result = {expression}; console.log(JSON.stringify(result)); }})"
        f".catch((error) => {{ console.error(error); process.exit(1); }});"
    )
    completed = subprocess.run(
        [node, "--input-type=module", "-e", script],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(completed.stdout)


def test_start_generation_clears_previous_review_session_state() -> None:
    result = _run_app_state(
        "(() => {"
        "const session = {"
        "id: 'session-1',"
        "created_at: '2026-04-23T10:12:33Z',"
        "language: 'en',"
        "topic_prompt: 'coffee',"
        "text: 'Generated text',"
        "analysis: {"
        "clarity_score: 72,"
        "pace_score: 65,"
        "hesitations: [],"
        "summary: ['Good effort.']"
        "}"
        "};"
        "const model = {"
        "...m.createInitialAppModel(),"
        "latest_session: session,"
        "history_save_error: 'save failed'"
        "};"
        "const next = m.startGeneration(model);"
        "return {"
        "flow: next.flow,"
        "latest_session: next.latest_session,"
        "history_save_error: next.history_save_error"
        "};"
        "})()"
    )

    assert result == {
        "flow": "generating_text",
        "latest_session": None,
        "history_save_error": None,
    }


def test_enter_history_clears_stale_history_selection_before_reload() -> None:
    result = _run_app_state(
        "(() => {"
        "const session = {"
        "id: 'session-1',"
        "created_at: '2026-04-23T10:12:33Z',"
        "language: 'en',"
        "topic_prompt: 'coffee',"
        "text: 'Generated text',"
        "analysis: {"
        "clarity_score: 72,"
        "pace_score: 65,"
        "hesitations: [],"
        "summary: ['Good effort.']"
        "}"
        "};"
        "const model = {"
        "...m.createInitialAppModel(),"
        "history_sessions: [session],"
        "selected_history_session: session,"
        "history_error: 'Could not load saved history. Try again.'"
        "};"
        "const next = m.enterHistory(model, 'review');"
        "return {"
        "flow: next.flow,"
        "history_origin: next.history_origin,"
        "history_sessions: next.history_sessions,"
        "selected_history_session: next.selected_history_session,"
        "history_error: next.history_error"
        "};"
        "})()"
    )

    assert result == {
        "flow": "history",
        "history_origin": "review",
        "history_sessions": None,
        "selected_history_session": None,
        "history_error": None,
    }
