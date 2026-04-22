from google import genai
from google.genai import types
from pydantic import BaseModel, ConfigDict, field_validator

from sayclearly.gemini.catalog import ThinkingLevel
from sayclearly.gemini.telemetry import GeminiTelemetry

_THINKING_BUDGETS: dict[ThinkingLevel, int] = {
    "low": 128,
    "medium": 512,
    "high": 1024,
}

_THINKING_LEVELS: dict[ThinkingLevel, types.ThinkingLevel] = {
    "low": types.ThinkingLevel.LOW,
    "medium": types.ThinkingLevel.MEDIUM,
    "high": types.ThinkingLevel.HIGH,
}


class GeminiClientError(RuntimeError):
    """Raised when Gemini text generation fails."""


class MissingGeminiApiKeyError(GeminiClientError):
    """Raised when Gemini is used without an API key."""


class GeminiProviderError(GeminiClientError):
    """Raised when the Gemini provider request fails."""


class GeminiInvalidCredentialsError(GeminiClientError):
    """Raised when the configured Gemini credentials are rejected."""


class GeminiMalformedResponseError(GeminiClientError):
    """Raised when Gemini returns a clearly invalid payload."""


class GeneratedExercise(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str

    @field_validator("text")
    @classmethod
    def validate_text(cls, value: str) -> str:
        stripped_value = value.strip()
        if not stripped_value:
            raise ValueError("Exercise text must not be empty")
        if "```" in stripped_value:
            raise ValueError("Exercise text must not contain markdown fences")
        return stripped_value


class GeminiClient:
    def __init__(
        self,
        *,
        api_key: str,
        sdk_client: object | None = None,
        telemetry: GeminiTelemetry | None = None,
    ) -> None:
        normalized_api_key = api_key.strip()
        if not normalized_api_key:
            raise MissingGeminiApiKeyError("Gemini API key is required.")

        self._sdk_client = sdk_client or genai.Client(api_key=normalized_api_key)
        self._telemetry = telemetry or GeminiTelemetry()

    def generate_exercise(
        self,
        *,
        prompt: str,
        model: str,
        thinking_level: ThinkingLevel,
    ) -> GeneratedExercise:
        trace = self._telemetry.start_text_generation(
            prompt=prompt,
            model=model,
            thinking_level=thinking_level,
        )

        try:
            response = self._sdk_client.models.generate_content(
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=1,
                    response_mime_type="application/json",
                    response_json_schema=GeneratedExercise.model_json_schema(),
                    thinking_config=self._build_thinking_config(
                        model=model,
                        thinking_level=thinking_level,
                    ),
                ),
            )
        except Exception as exc:  # pragma: no cover - SDK-specific failures vary
            trace.record_error(str(exc))
            if _is_invalid_credentials_error(exc):
                raise GeminiInvalidCredentialsError(
                    "Gemini API key was rejected. Update it and try again."
                ) from exc
            raise GeminiProviderError("Gemini text generation request failed.") from exc

        try:
            if isinstance(response.text, str) and response.text.strip() != "":
                exercise = GeneratedExercise.model_validate_json(response.text)
            else:
                exercise = GeneratedExercise.model_validate(response.parsed)
        except Exception as exc:
            trace.record_error(str(exc))
            raise GeminiMalformedResponseError("Gemini returned malformed exercise text.") from exc

        trace.record_success(exercise.text)
        return exercise

    def _build_thinking_config(
        self,
        *,
        model: str,
        thinking_level: ThinkingLevel,
    ) -> types.ThinkingConfig:
        if model.startswith("gemini-3"):
            return types.ThinkingConfig(thinking_level=_THINKING_LEVELS[thinking_level])

        return types.ThinkingConfig(thinking_budget=_THINKING_BUDGETS[thinking_level])


def _is_invalid_credentials_error(exc: Exception) -> bool:
    code = getattr(exc, "code", None)
    if code not in {401, 403}:
        return False

    message = getattr(exc, "message", str(exc)).lower()
    return any(
        marker in message
        for marker in (
            "api key",
            "authentication",
            "unauthenticated",
            "permission denied",
            "credentials",
        )
    )
