import pytest

from sayclearly.gemini.client import (
    GeminiClient,
    GeminiInvalidCredentialsError,
    GeminiMalformedResponseError,
    GeneratedExercise,
)
from sayclearly.gemini.telemetry import GeminiTelemetry


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


class FailingObservation:
    def update(self, **kwargs) -> None:
        raise RuntimeError("telemetry update failed")

    def end(self) -> None:
        raise RuntimeError("telemetry end failed")


class FailingLangfuse:
    def start_observation(self, **kwargs) -> FailingObservation:
        return FailingObservation()


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


def test_generate_exercise_uses_thinking_level_for_default_gemini_3_models() -> None:
    sdk_client = FakeSdkClient(FakeResponse({"text": "Speak clearly and stay relaxed."}))
    client = GeminiClient(api_key="test-key", sdk_client=sdk_client)

    client.generate_exercise(
        prompt="Generate a reading exercise.",
        model="gemini-3-flash-preview",
        thinking_level="high",
    )

    config = sdk_client.models.calls[0]["config"]
    assert config.thinking_config.thinking_level == "HIGH"
    assert config.thinking_config.thinking_budget is None


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


def test_generate_exercise_classifies_invalid_api_key_errors() -> None:
    class FakeApiError(Exception):
        def __init__(self) -> None:
            self.code = 401
            self.message = "API key not valid. Please pass a valid API key."
            super().__init__(self.message)

    sdk_client = FakeSdkClient(FakeApiError())
    client = GeminiClient(api_key="test-key", sdk_client=sdk_client)

    with pytest.raises(GeminiInvalidCredentialsError, match="API key"):
        client.generate_exercise(
            prompt="Generate a reading exercise.",
            model="gemini-2.5-flash",
            thinking_level="low",
        )


def test_generate_exercise_succeeds_when_telemetry_update_fails(monkeypatch) -> None:
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "public-key")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "secret-key")
    monkeypatch.setenv("LANGFUSE_HOST", "https://langfuse.example")
    sdk_client = FakeSdkClient(FakeResponse({"text": "Speak clearly and stay relaxed."}))
    telemetry = GeminiTelemetry(langfuse_factory=lambda **_: FailingLangfuse())
    client = GeminiClient(api_key="test-key", sdk_client=sdk_client, telemetry=telemetry)

    exercise = client.generate_exercise(
        prompt="Generate a reading exercise.",
        model="gemini-2.5-flash",
        thinking_level="medium",
    )

    assert exercise == GeneratedExercise(text="Speak clearly and stay relaxed.")
