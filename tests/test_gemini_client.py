import pytest

from sayclearly.gemini.client import (
    GeminiClient,
    GeminiInvalidCredentialsError,
    GeminiMalformedResponseError,
    GeneratedExercise,
)
from sayclearly.gemini.telemetry import GeminiTelemetry
from sayclearly.recording.models import StructuredAudioAnalysis


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
    def __init__(self, parsed, text: str | None = None) -> None:
        self.parsed = parsed
        self.text = text


class FailingObservation:
    def update(self, **kwargs) -> None:
        raise RuntimeError("telemetry update failed")

    def end(self) -> None:
        raise RuntimeError("telemetry end failed")


class FailingLangfuse:
    def start_observation(self, **kwargs) -> FailingObservation:
        return FailingObservation()


def test_generate_exercise_parses_structured_json_and_uses_model_config() -> None:
    sdk_client = FakeSdkClient(
        FakeResponse(None, text='{"text": "Speak clearly and stay relaxed."}')
    )
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
    assert config.response_json_schema == GeneratedExercise.model_json_schema()
    assert config.response_schema is None
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


def test_analyze_audio_parses_structured_json_and_uses_model_config() -> None:
    sdk_client = FakeSdkClient(
        FakeResponse(
            None,
            text='{"clarity_score":72,"pace_score":65,"hesitations":[],"summary":["Good"],"recommendations":["Practice"]}',
        )
    )
    client = GeminiClient(api_key="test-key", sdk_client=sdk_client)

    result = client.analyze_audio(
        audio_bytes=b"fake audio",
        content_type="audio/webm",
        prompt="Analyze this recording.",
        model="gemini-2.5-flash",
        thinking_level="medium",
        system_instruction="You are a coach.",
    )

    assert result.clarity_score == 72
    assert result.pace_score == 65
    call = sdk_client.models.calls[0]
    assert call["model"] == "gemini-2.5-flash"
    contents = call["contents"]
    assert len(contents) == 2
    assert call["config"].response_mime_type == "application/json"
    assert call["config"].response_json_schema == StructuredAudioAnalysis.model_json_schema()


def test_analyze_audio_uses_thinking_level_for_default_gemini_3_models() -> None:
    sdk_client = FakeSdkClient(
        FakeResponse(
            {
                "clarity_score": 80,
                "pace_score": 70,
                "hesitations": [],
                "summary": [],
                "recommendations": [],
            }
        )
    )
    client = GeminiClient(api_key="test-key", sdk_client=sdk_client)

    client.analyze_audio(
        audio_bytes=b"fake audio",
        content_type="audio/webm",
        prompt="Analyze this recording.",
        model="gemini-3-flash-preview",
        thinking_level="high",
    )

    config = sdk_client.models.calls[0]["config"]
    assert config.thinking_config.thinking_level == "HIGH"
    assert config.thinking_config.thinking_budget is None


def test_analyze_audio_rejects_malformed_response() -> None:
    sdk_client = FakeSdkClient(
        FakeResponse(
            {
                "clarity_score": -1,
                "pace_score": 50,
                "hesitations": [],
                "summary": [],
                "recommendations": [],
            }
        )
    )
    client = GeminiClient(api_key="test-key", sdk_client=sdk_client)

    with pytest.raises(GeminiMalformedResponseError):
        client.analyze_audio(
            audio_bytes=b"fake audio",
            content_type="audio/webm",
            prompt="Analyze this recording.",
            model="gemini-2.5-flash",
            thinking_level="low",
        )


def test_analyze_audio_classifies_invalid_api_key_errors() -> None:
    class FakeApiError(Exception):
        def __init__(self) -> None:
            self.code = 401
            self.message = "API key not valid. Please pass a valid API key."
            super().__init__(self.message)

    sdk_client = FakeSdkClient(FakeApiError())
    client = GeminiClient(api_key="test-key", sdk_client=sdk_client)

    with pytest.raises(GeminiInvalidCredentialsError, match="API key"):
        client.analyze_audio(
            audio_bytes=b"fake audio",
            content_type="audio/webm",
            prompt="Analyze this recording.",
            model="gemini-2.5-flash",
            thinking_level="low",
        )
