from pathlib import Path

import pytest

from sayclearly.exercise.models import ExerciseGenerationRequest
from sayclearly.exercise.service import (
    ExerciseService,
    ExerciseServiceConfigurationError,
)
from sayclearly.gemini.client import GeneratedExercise
from sayclearly.storage.files import (
    load_config,
    load_history,
    load_secrets,
    save_config,
    save_history,
    save_secrets,
)
from sayclearly.storage.models import HistorySession, SessionAnalysis


class FakeGeminiClient:
    def __init__(self, generated_exercise: GeneratedExercise) -> None:
        self.generated_exercise = generated_exercise
        self.calls: list[dict[str, object]] = []

    def generate_exercise(
        self, *, prompt: str, model: str, thinking_level: str
    ) -> GeneratedExercise:
        self.calls.append(
            {
                "prompt": prompt,
                "model": model,
                "thinking_level": thinking_level,
            }
        )
        return self.generated_exercise


def make_history_session(session_id: str, text: str) -> HistorySession:
    return HistorySession(
        id=session_id,
        created_at=f"2026-04-20T10:00:{session_id}",
        language="en",
        topic_prompt="",
        text=text,
        analysis=SessionAnalysis(
            clarity_score=7,
            pace_score=6,
            summary=["steady reading"],
        ),
    )


def test_generate_text_reuses_last_topic_when_requested(tmp_path: Path) -> None:
    config = load_config(tmp_path)
    save_config(
        tmp_path,
        config.model_copy(update={"last_topic_prompt": "quiet forest mornings"}),
    )
    secrets = load_secrets(tmp_path)
    save_secrets(
        tmp_path,
        secrets.model_copy(
            update={"gemini": secrets.gemini.model_copy(update={"api_key": "stored-key"})}
        ),
    )
    client = FakeGeminiClient(GeneratedExercise(text="Quiet mornings make speech feel calmer."))
    service = ExerciseService(tmp_path, gemini_client=client)

    response = service.generate_text(
        ExerciseGenerationRequest(
            language="en",
            analysis_language="uk",
            topic_prompt="   ",
            reuse_last_topic=True,
        )
    )

    assert response.topic_prompt == "quiet forest mornings"
    assert client.calls[0]["model"] == load_config(tmp_path).gemini.text_model


def test_generate_text_uses_recent_history_and_configured_generation_settings(
    tmp_path: Path,
) -> None:
    config = load_config(tmp_path)
    save_config(
        tmp_path,
        config.model_copy(
            update={
                "gemini": config.gemini.model_copy(
                    update={
                        "text_model": "gemini-2.5-flash",
                        "text_thinking_level": "medium",
                    }
                )
            }
        ),
    )
    secrets = load_secrets(tmp_path)
    save_secrets(
        tmp_path,
        secrets.model_copy(
            update={"gemini": secrets.gemini.model_copy(update={"api_key": "stored-key"})}
        ),
    )
    history = load_history(tmp_path)
    save_history(
        tmp_path,
        history.model_copy(
            update={
                "sessions": [
                    make_history_session("01", "Read slowly and relax your jaw."),
                    make_history_session("02", "Keep the rhythm steady while you speak."),
                ]
            }
        ),
    )
    client = FakeGeminiClient(
        GeneratedExercise(text="Start slowly, then let the rhythm stay even.")
    )
    service = ExerciseService(tmp_path, gemini_client=client)

    response = service.generate_text(
        ExerciseGenerationRequest(
            language="en",
            analysis_language="uk",
            topic_prompt="morning coffee routines",
            reuse_last_topic=False,
        )
    )

    assert response.text == "Start slowly, then let the rhythm stay even."
    assert response.topic_prompt == "morning coffee routines"
    assert client.calls == [
        {
            "prompt": client.calls[0]["prompt"],
            "model": "gemini-2.5-flash",
            "thinking_level": "medium",
        }
    ]
    assert "morning coffee routines" in client.calls[0]["prompt"]
    assert "Read slowly and relax your jaw." in client.calls[0]["prompt"]
    assert "Keep the rhythm steady while you speak." in client.calls[0]["prompt"]


def test_generate_text_scopes_recent_history_to_request_language(tmp_path: Path) -> None:
    secrets = load_secrets(tmp_path)
    save_secrets(
        tmp_path,
        secrets.model_copy(
            update={"gemini": secrets.gemini.model_copy(update={"api_key": "stored-key"})}
        ),
    )
    history = load_history(tmp_path)
    save_history(
        tmp_path,
        history.model_copy(
            update={
                "sessions": [
                    make_history_session("01", "Read slowly and relax your jaw."),
                    make_history_session(
                        "02", "Keep your shoulders loose while speaking."
                    ).model_copy(update={"language": "uk"}),
                ]
            }
        ),
    )
    client = FakeGeminiClient(
        GeneratedExercise(text="Start slowly, then let the rhythm stay even.")
    )
    service = ExerciseService(tmp_path, gemini_client=client)

    service.generate_text(
        ExerciseGenerationRequest(
            language="en",
            analysis_language="uk",
            topic_prompt="morning coffee routines",
            reuse_last_topic=False,
        )
    )

    assert "Read slowly and relax your jaw." in client.calls[0]["prompt"]
    assert "Keep your shoulders loose while speaking." not in client.calls[0]["prompt"]


def test_generate_text_uses_default_generation_settings_when_not_overridden(
    tmp_path: Path,
) -> None:
    secrets = load_secrets(tmp_path)
    save_secrets(
        tmp_path,
        secrets.model_copy(
            update={"gemini": secrets.gemini.model_copy(update={"api_key": "stored-key"})}
        ),
    )
    client = FakeGeminiClient(
        GeneratedExercise(text="Start slowly, then let the rhythm stay even.")
    )
    service = ExerciseService(tmp_path, gemini_client=client)

    service.generate_text(
        ExerciseGenerationRequest(
            language="en",
            analysis_language="uk",
            topic_prompt="morning coffee routines",
            reuse_last_topic=False,
        )
    )

    assert client.calls == [
        {
            "prompt": client.calls[0]["prompt"],
            "model": "gemini-3-flash-preview",
            "thinking_level": "high",
        }
    ]


def test_generate_text_sanitizes_unsupported_stored_text_model(tmp_path: Path) -> None:
    config = load_config(tmp_path)
    save_config(
        tmp_path,
        config.model_copy(
            update={
                "gemini": config.gemini.model_copy(
                    update={
                        "text_model": "unsupported-hand-edited-model",
                        "analysis_model": "unsupported-hand-edited-model",
                    }
                )
            }
        ),
    )
    secrets = load_secrets(tmp_path)
    save_secrets(
        tmp_path,
        secrets.model_copy(
            update={"gemini": secrets.gemini.model_copy(update={"api_key": "stored-key"})}
        ),
    )
    client = FakeGeminiClient(
        GeneratedExercise(text="Start slowly, then let the rhythm stay even.")
    )
    service = ExerciseService(tmp_path, gemini_client=client)

    service.generate_text(
        ExerciseGenerationRequest(
            language="en",
            analysis_language="uk",
            topic_prompt="morning coffee routines",
            reuse_last_topic=False,
        )
    )

    assert client.calls == [
        {
            "prompt": client.calls[0]["prompt"],
            "model": "gemini-3-flash-preview",
            "thinking_level": "high",
        }
    ]


def test_generate_text_requires_a_configured_gemini_api_key(tmp_path: Path) -> None:
    service = ExerciseService(tmp_path)

    with pytest.raises(ExerciseServiceConfigurationError, match="Gemini API key"):
        service.generate_text(
            ExerciseGenerationRequest(
                language="en",
                analysis_language="uk",
                topic_prompt="clear consonants",
                reuse_last_topic=False,
            )
        )
