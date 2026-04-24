from fastapi.testclient import TestClient

from sayclearly.app import create_app


def test_home_page_renders_stage_3_shell() -> None:
    client = TestClient(create_app())

    response = client.get("/")

    assert response.status_code == 200
    assert "data-app-root" in response.text
    assert 'data-screen="setup"' in response.text
    assert 'data-screen="exercise"' in response.text
    assert "data-settings-panel" in response.text
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

    response = client.get("/static/dist/app.js")

    assert response.status_code == 200
    assert "javascript" in response.headers["content-type"]
    assert "/api/generate-text" in response.text


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
