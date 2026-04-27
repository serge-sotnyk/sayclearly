import json
from pathlib import Path

from fastapi.testclient import TestClient

from sayclearly.app import create_app
from sayclearly.history.service import HistoryService
from sayclearly.storage.models import HistorySession, SessionAnalysis


def test_home_page_renders_stage_3_shell() -> None:
    client = TestClient(create_app())

    response = client.get("/")

    assert response.status_code == 200
    assert "data-app-root" in response.text
    assert 'data-screen="setup"' in response.text
    assert 'data-screen="exercise"' in response.text
    assert "data-settings-modal" in response.text
    assert "data-settings-modal-backdrop" in response.text
    assert "data-settings-modal-close" in response.text
    assert "data-status-message" in response.text
    assert "data-open-settings-button" in response.text
    assert "data-api-key-input" in response.text
    assert "data-api-key-hint" in response.text
    assert "data-text-model-select" in response.text
    assert "data-analysis-model-select" in response.text
    assert "data-same-model-toggle" in response.text
    assert "data-thinking-level-select" in response.text
    assert "data-topic-input" in response.text
    assert "data-generate-button" in response.text
    assert "data-step-label" in response.text
    assert "data-step-title" in response.text
    assert "data-step-instruction" in response.text
    assert "data-exercise-text" in response.text
    assert "data-next-step-button" in response.text
    assert "data-settings-status" in response.text
    assert "data-clear-api-key-button" in response.text
    assert "data-clear-history-button" in response.text
    assert "data-session-limit-input" in response.text
    assert "data-save-settings-button" in response.text
    assert "data-close-settings-button" in response.text
    assert "/static/dist/app.js" in response.text


def test_home_page_renders_stage_5_model_controls() -> None:
    client = TestClient(create_app())

    response = client.get("/")

    assert response.status_code == 200
    assert "Text generation model" in response.text
    assert "Analysis model" in response.text
    assert "Use the same model for analysis" in response.text
    assert "Thinking level" in response.text


def test_home_page_renders_stage_4_recording_hooks() -> None:
    client = TestClient(create_app())

    response = client.get("/")

    assert response.status_code == 200
    assert "data-recording-controls" in response.text
    assert "data-recording-status" in response.text
    assert "data-start-recording-button" in response.text
    assert "data-stop-recording-button" in response.text
    assert "data-recording-preview" in response.text
    assert "data-analyze-recording-button" in response.text
    assert "data-record-again-button" in response.text
    assert "data-review-panel" in response.text
    assert "data-review-summary" in response.text
    assert "data-review-clarity" in response.text
    assert "data-review-pace" in response.text
    assert "data-review-hesitations" in response.text
    assert "data-review-recommendations" in response.text
    assert "hidden data-start-recording-button" in response.text
    assert "hidden data-stop-recording-button" in response.text
    assert "hidden data-analyze-recording-button" in response.text
    assert "hidden data-record-again-button" in response.text
    assert "controls hidden data-recording-preview" in response.text
    assert 'class="review-panel" hidden data-review-panel aria-live="polite"' in response.text


def test_home_page_uses_root_path_for_stage_3_bundle() -> None:
    client = TestClient(create_app(), root_path="/sayclearly")

    response = client.get("/")

    assert response.status_code == 200
    assert "/sayclearly/static/dist/app.js" in response.text


def test_frontend_bundle_is_served_with_generate_endpoint_reference() -> None:
    client = TestClient(create_app())

    bundle_response = client.get("/static/dist/app.js")
    api_client_response = client.get("/static/dist/api_client.js")

    assert bundle_response.status_code == 200
    assert "javascript" in bundle_response.headers["content-type"]
    assert api_client_response.status_code == 200
    assert "javascript" in api_client_response.headers["content-type"]
    # API endpoints live in the centralized api_client module since A2.
    assert "/api/generate-text" in api_client_response.text


def test_stylesheet_preserves_hidden_attribute_behavior() -> None:
    client = TestClient(create_app())

    response = client.get("/static/styles.css")

    assert response.status_code == 200
    assert "[hidden]" in response.text
    assert "display: none !important;" in response.text


def test_home_page_renders_stage_7_history_hooks() -> None:
    client = TestClient(create_app())

    response = client.get("/")

    assert response.status_code == 200
    assert "data-review-actions" in response.text
    assert "data-new-session-button" in response.text
    assert "data-review-reuse-topic-button" in response.text
    assert "data-open-history-button" in response.text
    assert 'data-screen="history"' in response.text
    assert "data-history-list" in response.text
    assert "data-history-empty-state" in response.text
    assert "data-history-error" in response.text
    assert "data-history-retry-button" in response.text
    assert "data-history-back-button" in response.text
    assert "data-history-details" in response.text
    assert "data-history-detail-summary" in response.text
    assert "data-history-detail-text" in response.text
    assert "data-history-detail-reuse-topic-button" in response.text


def test_home_page_keeps_review_actions_hidden_until_review_state() -> None:
    client = TestClient(create_app())

    response = client.get("/")

    assert response.status_code == 200
    assert "data-review-actions hidden" in response.text


def test_home_page_renders_stage_8_trust_copy() -> None:
    client = TestClient(create_app())

    response = client.get("/")

    assert response.status_code == 200
    assert "Runs fully locally on your machine." in response.text
    assert "Bring your own Gemini API key." in response.text
    assert "Recordings are temporary and are deleted after each analysis attempt." in response.text
    assert "data-telemetry-note" in response.text
    assert "data-local-storage-note" in response.text


def test_home_page_renders_history_modal_and_button(tmp_path: Path) -> None:
    service = HistoryService(tmp_path)
    service.save_session(
        HistorySession(
            id="01",
            created_at="2026-04-20T10:00:01",
            language="Ukrainian",
            analysis_language="English",
            topic_prompt="rust facts",
            text="t1",
            analysis=SessionAnalysis(clarity_score=80, pace_score=70, summary=["ok"]),
        )
    )
    service.save_session(
        HistorySession(
            id="02",
            created_at="2026-04-20T10:00:02",
            language="English",
            analysis_language="English",
            topic_prompt="ordering coffee",
            text="t2",
            analysis=SessionAnalysis(clarity_score=80, pace_score=70, summary=["ok"]),
        )
    )
    client = TestClient(create_app(tmp_path))

    response = client.get("/")

    assert response.status_code == 200
    assert "data-reuse-topic-button" not in response.text
    assert "data-history-button" in response.text
    assert "data-history-modal" in response.text
    assert "data-history-modal-search" in response.text
    assert "data-history-modal-matches-list" in response.text
    assert "data-history-modal-all-list" in response.text
    assert "data-recent-topics-payload" in response.text
    assert 'value="ordering coffee"' in response.text

    payload_marker = "data-recent-topics-payload>"
    start = response.text.index(payload_marker) + len(payload_marker)
    end = response.text.index("</script>", start)
    payload = json.loads(response.text[start:end])
    assert [entry["topic"] for entry in payload] == ["ordering coffee", "rust facts"]


def test_home_page_handles_empty_history_for_recent_topics(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))

    response = client.get("/")

    assert response.status_code == 200
    assert "data-history-modal" in response.text
    assert "data-recent-topics-payload" in response.text


def test_history_modal_lives_inside_app_root_so_collect_shell_elements_can_find_it() -> None:
    client = TestClient(create_app())

    response = client.get("/")

    assert response.status_code == 200
    body = response.text
    main_open = body.index("<main")
    main_close = body.index("</main>")
    modal_marker = body.index("data-history-modal")
    assert main_open < modal_marker < main_close, (
        "History modal must be a descendant of <main data-app-root> so that "
        "collectShellElements (which scopes its querySelector calls to the app root) "
        "can locate it on startup. If it sits outside <main>, the JS bootstrap "
        "throws and the setup/exercise/settings panels render uncontrolled."
    )


def test_settings_modal_lives_inside_app_root() -> None:
    client = TestClient(create_app())

    response = client.get("/")

    assert response.status_code == 200
    body = response.text
    main_open = body.index("<main")
    main_close = body.index("</main>")
    modal_marker = body.index("data-settings-modal")
    assert main_open < modal_marker < main_close, (
        "Settings modal must be a descendant of <main data-app-root> so that "
        "collectShellElements can locate it on startup."
    )
