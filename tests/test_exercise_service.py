from pathlib import Path

from sayclearly.exercise.models import ExerciseGenerationRequest
from sayclearly.exercise.service import ExerciseService
from sayclearly.storage.files import load_config, save_config


def test_generate_text_reuses_last_topic_when_requested(tmp_path: Path) -> None:
    config = load_config(tmp_path)
    save_config(
        tmp_path,
        config.model_copy(update={"last_topic_prompt": "quiet forest mornings"}),
    )
    service = ExerciseService(tmp_path)

    response = service.generate_text(
        ExerciseGenerationRequest(
            language="en",
            analysis_language="uk",
            topic_prompt="   ",
            reuse_last_topic=True,
        )
    )

    assert response.topic_prompt == "quiet forest mornings"


def test_generate_text_returns_placeholder_reading_text_for_empty_topic(
    tmp_path: Path,
) -> None:
    service = ExerciseService(tmp_path)

    response = service.generate_text(
        ExerciseGenerationRequest(
            language="en",
            analysis_language="uk",
            topic_prompt="",
            reuse_last_topic=False,
        )
    )

    sentences = [sentence.strip() for sentence in response.text.split(".") if sentence.strip()]

    assert 5 <= len(sentences) <= 8
    assert "placeholder" in response.text.lower()
    assert response.language == "en"
