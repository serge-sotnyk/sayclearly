import pytest

from sayclearly.gemini.client import (
    GeminiClient,
    GeminiMalformedResponseError,
    GeneratedExercise,
)


class FakeModels:
    def __init__(self, response) -> None:
        self.response = response
        self.calls: list[dict[str, object]] = []

    def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


class FakeSdkClient:
    def __init__(self, response) -> None:
        self.models = FakeModels(response)


class FakeResponse:
    def __init__(self, parsed) -> None:
        self.parsed = parsed


def test_generate_exercise_parses_structured_json_and_uses_model_config() -> None:
    sdk_client = FakeSdkClient(FakeResponse({"text": "Speak clearly and stay relaxed."}))
    client = GeminiClient(api_key="test-key", sdk_client=sdk_client)

    exercise = client.generate_exercise(
        prompt="Generate a reading exercise.",
        model="gemini-2.5-flash",
        thinking_level="medium",
    )

    assert exercise == GeneratedExercise(text="Speak clearly and stay relaxed.")
    call = sdk_client.models.calls[0]
    assert call["model"] == "gemini-2.5-flash"
    assert call["contents"] == "Generate a reading exercise."
    config = call["config"]
    assert config.temperature == 1
    assert config.response_mime_type == "application/json"
    assert config.response_schema is GeneratedExercise
    assert config.thinking_config.thinking_budget > 0


@pytest.mark.parametrize(
    "text",
    [
        "",
        "   ",
        '```json\n{"text": "bad"}\n```',
    ],
)
def test_generate_exercise_rejects_clearly_malformed_model_output(text: str) -> None:
    sdk_client = FakeSdkClient(FakeResponse({"text": text}))
    client = GeminiClient(api_key="test-key", sdk_client=sdk_client)

    with pytest.raises(GeminiMalformedResponseError):
        client.generate_exercise(
            prompt="Generate a reading exercise.",
            model="gemini-2.5-flash",
            thinking_level="low",
        )
