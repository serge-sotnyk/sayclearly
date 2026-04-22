import json
from pathlib import Path

import pytest

from sayclearly.storage.files import (
    StorageError,
    load_config,
    load_history,
    load_secrets,
    save_config,
    save_history,
    save_secrets,
)
from sayclearly.storage.models import HistoryStore, StoredSecrets


def test_load_config_creates_default_storage_tree(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.delenv("SAYCLEARLY_DEFAULT_TEXT_MODEL", raising=False)
    monkeypatch.delenv("SAYCLEARLY_DEFAULT_ANALYSIS_MODEL", raising=False)

    config = load_config(tmp_path)

    assert config.version == 2
    assert config.text_language == "uk"
    assert config.gemini.text_model == "gemini-3-flash"
    assert config.gemini.analysis_model == "gemini-3-flash"
    assert config.gemini.same_model_for_analysis is True
    assert config.gemini.text_thinking_level == "high"
    assert (tmp_path / "cache").is_dir()
    assert json.loads((tmp_path / "config.json").read_text(encoding="utf-8"))["version"] == 2
    assert json.loads((tmp_path / "secrets.json").read_text(encoding="utf-8")) == {
        "version": 1,
        "gemini": {},
        "langfuse": {},
    }
    assert json.loads((tmp_path / "history.json").read_text(encoding="utf-8")) == {
        "version": 1,
        "sessions": [],
    }
    assert load_secrets(tmp_path).version == 1
    assert load_history(tmp_path).version == 1


def test_load_config_uses_environment_model_defaults_for_new_storage(
    tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.setenv("SAYCLEARLY_DEFAULT_TEXT_MODEL", "gemini-3.1-flash-lite-preview")

    config = load_config(tmp_path)

    assert config.gemini.text_model == "gemini-3.1-flash-lite-preview"
    assert config.gemini.analysis_model == "gemini-3.1-flash-lite-preview"


def test_load_config_migrates_version_1_gemini_model_to_version_2_schema(tmp_path: Path) -> None:
    load_config(tmp_path)
    (tmp_path / "config.json").write_text(
        json.dumps(
            {
                "version": 1,
                "text_language": "en",
                "analysis_language": "uk",
                "ui_language": "en",
                "same_language_for_analysis": False,
                "last_topic_prompt": "legacy prompt",
                "session_limit": 222,
                "keep_last_audio": True,
                "gemini": {"model": "gemini-2.5-flash"},
                "langfuse": {"host": "https://langfuse.example"},
            }
        ),
        encoding="utf-8",
    )

    config = load_config(tmp_path)

    assert config.version == 2
    assert config.gemini.text_model == "gemini-2.5-flash"
    assert config.gemini.analysis_model == "gemini-2.5-flash"
    assert config.gemini.same_model_for_analysis is True
    assert config.gemini.text_thinking_level == "high"
    assert json.loads((tmp_path / "config.json").read_text(encoding="utf-8")) == {
        "version": 2,
        "text_language": "en",
        "analysis_language": "uk",
        "ui_language": "en",
        "same_language_for_analysis": False,
        "last_topic_prompt": "legacy prompt",
        "session_limit": 222,
        "keep_last_audio": True,
        "gemini": {
            "text_model": "gemini-2.5-flash",
            "analysis_model": "gemini-2.5-flash",
            "same_model_for_analysis": True,
            "text_thinking_level": "high",
        },
        "langfuse": {"host": "https://langfuse.example"},
    }


def test_load_config_migrates_version_1_without_gemini_model_using_defaults(
    tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.delenv("SAYCLEARLY_DEFAULT_TEXT_MODEL", raising=False)
    monkeypatch.delenv("SAYCLEARLY_DEFAULT_ANALYSIS_MODEL", raising=False)
    load_config(tmp_path)
    (tmp_path / "config.json").write_text(json.dumps({"version": 1}), encoding="utf-8")

    config = load_config(tmp_path)

    assert config.version == 2
    assert config.gemini.text_model == "gemini-3-flash"
    assert config.gemini.analysis_model == "gemini-3-flash"
    assert config.gemini.same_model_for_analysis is True
    assert config.gemini.text_thinking_level == "high"
    assert json.loads((tmp_path / "config.json").read_text(encoding="utf-8")) == {
        "version": 2,
        "text_language": "uk",
        "analysis_language": "uk",
        "ui_language": "en",
        "same_language_for_analysis": True,
        "last_topic_prompt": "",
        "session_limit": 300,
        "keep_last_audio": False,
        "gemini": {
            "text_model": "gemini-3-flash",
            "analysis_model": "gemini-3-flash",
            "same_model_for_analysis": True,
            "text_thinking_level": "high",
        },
        "langfuse": {},
    }


def test_save_config_replaces_the_previous_document(tmp_path: Path) -> None:
    config = load_config(tmp_path)

    save_config(tmp_path, config.model_copy(update={"text_language": "en"}))

    assert load_config(tmp_path).text_language == "en"
    assert list(tmp_path.glob("*.tmp")) == []


def test_load_config_raises_storage_error_for_malformed_json(tmp_path: Path) -> None:
    load_config(tmp_path)
    (tmp_path / "config.json").write_text("{bad json", encoding="utf-8")

    with pytest.raises(StorageError, match="Invalid JSON"):
        load_config(tmp_path)


def test_save_secrets_round_trips_saved_values(tmp_path: Path) -> None:
    load_config(tmp_path)
    secrets = StoredSecrets.model_validate(
        {
            "version": 1,
            "gemini": {"api_key": "secret-key"},
            "langfuse": {
                "public_key": "public-key",
                "secret_key": "secret-key",
            },
        }
    )

    save_secrets(tmp_path, secrets)

    assert load_secrets(tmp_path) == secrets


def test_save_history_round_trips_saved_values(tmp_path: Path) -> None:
    load_config(tmp_path)
    history = HistoryStore.model_validate(
        {
            "version": 1,
            "sessions": [
                {
                    "id": "session-1",
                    "created_at": "2026-04-21T10:30:45Z",
                    "language": "uk",
                    "topic_prompt": "Talk about your day",
                    "text": "Sample transcript",
                    "analysis": {
                        "clarity_score": 82,
                        "pace_score": 74,
                        "hesitations": [
                            {
                                "start": 1.25,
                                "end": 1.75,
                                "note": "Long pause",
                            }
                        ],
                        "summary": ["Clear overall", "Slightly rushed ending"],
                    },
                }
            ],
        }
    )

    save_history(tmp_path, history)

    assert load_history(tmp_path) == history


def test_history_store_accepts_spec_created_at_without_timezone() -> None:
    history = HistoryStore.model_validate(
        {
            "version": 1,
            "sessions": [
                {
                    "id": "session-1",
                    "created_at": "2026-04-18T18:42:11",
                    "language": "uk",
                    "text": "Sample transcript",
                    "analysis": {
                        "clarity_score": 82,
                        "pace_score": 74,
                        "hesitations": [],
                        "summary": [],
                    },
                }
            ],
        }
    )

    assert history.sessions[0].created_at == "2026-04-18T18:42:11"


@pytest.mark.parametrize(
    "created_at",
    [
        "2026-04-21T10:30:45.1Z",
        "2026-04-21T10:30:45.123456Z",
        "2026-04-21T10:30:45.123456+02:00",
        "2026-04-21T10:30:45.123456",
    ],
)
def test_history_store_accepts_created_at_with_fractional_seconds(created_at: str) -> None:
    history = HistoryStore.model_validate(
        {
            "version": 1,
            "sessions": [
                {
                    "id": "session-1",
                    "created_at": created_at,
                    "language": "uk",
                    "text": "Sample transcript",
                    "analysis": {
                        "clarity_score": 82,
                        "pace_score": 74,
                        "hesitations": [],
                        "summary": [],
                    },
                }
            ],
        }
    )

    assert history.sessions[0].created_at == created_at


@pytest.mark.parametrize(
    ("payload", "message"),
    [
        ({"version": 1, "session_limit": 0}, "Invalid data"),
        ({"version": 1, "session_limit": -10}, "Invalid data"),
    ],
)
def test_load_config_rejects_semantically_invalid_payloads(
    tmp_path: Path, payload: dict[str, int], message: str
) -> None:
    load_config(tmp_path)
    (tmp_path / "config.json").write_text(json.dumps(payload), encoding="utf-8")

    with pytest.raises(StorageError, match=message):
        load_config(tmp_path)


@pytest.mark.parametrize(
    ("filename", "payload"),
    [
        ("config.json", {"version": 999}),
        ("secrets.json", {"version": 999, "gemini": {}, "langfuse": {}}),
        ("history.json", {"version": 999, "sessions": []}),
    ],
)
def test_load_storage_rejects_unsupported_schema_versions(
    tmp_path: Path, filename: str, payload: dict[str, object]
) -> None:
    load_config(tmp_path)
    (tmp_path / filename).write_text(json.dumps(payload), encoding="utf-8")

    loaders = {
        "config.json": load_config,
        "secrets.json": load_secrets,
        "history.json": load_history,
    }

    with pytest.raises(StorageError, match="Invalid data"):
        loaders[filename](tmp_path)


@pytest.mark.parametrize(
    "payload",
    [
        {
            "version": 1,
            "sessions": [
                {
                    "id": "session-1",
                    "created_at": "2026-04-21T10:30:45Z",
                    "language": "uk",
                    "text": "Sample transcript",
                    "analysis": {
                        "clarity_score": -1,
                        "pace_score": 70,
                        "hesitations": [],
                        "summary": [],
                    },
                }
            ],
        },
        {
            "version": 1,
            "sessions": [
                {
                    "id": "session-1",
                    "created_at": "2026-04-21T10:30:45Z",
                    "language": "uk",
                    "text": "Sample transcript",
                    "analysis": {
                        "clarity_score": 70,
                        "pace_score": 101,
                        "hesitations": [],
                        "summary": [],
                    },
                }
            ],
        },
        {
            "version": 1,
            "sessions": [
                {
                    "id": "session-1",
                    "created_at": "2026-04-18",
                    "language": "uk",
                    "text": "Sample transcript",
                    "analysis": {
                        "clarity_score": 70,
                        "pace_score": 80,
                        "hesitations": [],
                        "summary": [],
                    },
                }
            ],
        },
        {
            "version": 1,
            "sessions": [
                {
                    "id": "session-1",
                    "created_at": "not-a-timestamp",
                    "language": "uk",
                    "text": "Sample transcript",
                    "analysis": {
                        "clarity_score": 70,
                        "pace_score": 80,
                        "hesitations": [],
                        "summary": [],
                    },
                }
            ],
        },
        {
            "version": 1,
            "sessions": [
                {
                    "id": "session-1",
                    "created_at": "2026-04-21T10:30:45Z",
                    "language": "uk",
                    "text": "Sample transcript",
                    "analysis": {
                        "clarity_score": 70,
                        "pace_score": 80,
                        "hesitations": [
                            {
                                "start": 2.0,
                                "end": 1.5,
                                "note": "Reversed times",
                            }
                        ],
                        "summary": [],
                    },
                }
            ],
        },
    ],
)
def test_load_history_rejects_semantically_invalid_payloads(
    tmp_path: Path, payload: dict[str, object]
) -> None:
    load_config(tmp_path)
    (tmp_path / "history.json").write_text(json.dumps(payload), encoding="utf-8")

    with pytest.raises(StorageError, match="Invalid data"):
        load_history(tmp_path)


def test_load_config_raises_storage_error_for_invalid_utf8(tmp_path: Path) -> None:
    load_config(tmp_path)
    (tmp_path / "config.json").write_bytes(b"\x80")

    with pytest.raises(StorageError, match="Could not read"):
        load_config(tmp_path)
