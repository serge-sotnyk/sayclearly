from pathlib import Path

from fastapi.testclient import TestClient

from sayclearly.app import create_app


def make_session(session_id: str) -> dict[str, object]:
    return {
        "id": session_id,
        "created_at": f"2026-04-20T10:00:{session_id}",
        "language": "uk",
        "topic_prompt": "interesting facts",
        "text": f"Generated text {session_id}",
        "analysis": {
            "clarity_score": 7,
            "pace_score": 6,
            "hesitations": [],
            "summary": [f"Summary {session_id}"],
        },
    }


def test_post_history_and_list_sessions_newest_first(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))

    first = client.post("/api/history", json=make_session("01"))
    second = client.post("/api/history", json=make_session("02"))
    listing = client.get("/api/history")

    assert first.status_code == 200
    assert second.status_code == 200
    assert listing.status_code == 200
    assert [session["id"] for session in listing.json()["sessions"]] == ["02", "01"]


def test_get_history_session_returns_one_session(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))
    client.post("/api/history", json=make_session("01"))

    response = client.get("/api/history/01")

    assert response.status_code == 200
    assert response.json()["id"] == "01"


def test_get_history_session_returns_404_for_missing_id(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))

    response = client.get("/api/history/missing")

    assert response.status_code == 404
    assert response.json() == {"detail": "History session not found: missing"}


def test_post_history_returns_400_for_invalid_payload_shape(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))

    response = client.post(
        "/api/history",
        json={"id": "01", "unexpected": "field"},
    )

    assert response.status_code == 400


def test_post_history_returns_422_for_semantically_invalid_payload(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))
    session = make_session("01")
    session["created_at"] = "not-an-iso-timestamp"

    response = client.post("/api/history", json=session)

    assert response.status_code == 422
