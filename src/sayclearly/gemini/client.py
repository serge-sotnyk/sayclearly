from google import genai
from google.genai import types
from pydantic import BaseModel, ConfigDict, field_validator

from sayclearly.gemini.catalog import ThinkingLevel
from sayclearly.gemini.telemetry import GeminiTelemetry
from sayclearly.recording.models import StructuredAudioAnalysis

_AUDIO_ANALYSIS_TEMPERATURE = 0.3
_TEXT_GENERATION_TEMPERATURE = 1.0

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
            temperature=_TEXT_GENERATION_TEMPERATURE,
        )

        try:
            response = self._sdk_client.models.generate_content(
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=_TEXT_GENERATION_TEMPERATURE,
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
            raise GeminiProviderError(
                _extract_provider_message(exc) or "Gemini text generation request failed."
            ) from exc

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

    def analyze_audio(
        self,
        *,
        audio_bytes: bytes,
        content_type: str,
        prompt: str,
        model: str,
        thinking_level: ThinkingLevel,
        system_instruction: str | None = None,
        language: str | None = None,
        analysis_language: str | None = None,
    ) -> StructuredAudioAnalysis:
        trace = self._telemetry.start_audio_analysis(
            prompt=prompt,
            model=model,
            thinking_level=thinking_level,
            temperature=_AUDIO_ANALYSIS_TEMPERATURE,
            audio_size_bytes=len(audio_bytes),
            content_type=content_type,
            language=language,
            analysis_language=analysis_language,
        )

        try:
            response = self._sdk_client.models.generate_content(
                model=model,
                contents=[
                    types.Part.from_bytes(data=audio_bytes, mime_type=content_type),
                    prompt,
                ],
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    temperature=_AUDIO_ANALYSIS_TEMPERATURE,
                    response_mime_type="application/json",
                    response_json_schema=StructuredAudioAnalysis.model_json_schema(),
                    thinking_config=self._build_thinking_config(
                        model=model,
                        thinking_level=thinking_level,
                    ),
                ),
            )
        except Exception as exc:
            trace.record_error(str(exc))
            if _is_invalid_credentials_error(exc):
                raise GeminiInvalidCredentialsError(
                    "Gemini API key was rejected. Update it and try again."
                ) from exc
            raise GeminiProviderError(
                _extract_provider_message(exc) or "Gemini audio analysis request failed."
            ) from exc

        try:
            if isinstance(response.text, str) and response.text.strip() != "":
                analysis = StructuredAudioAnalysis.model_validate_json(response.text)
            else:
                analysis = StructuredAudioAnalysis.model_validate(response.parsed)
        except Exception as exc:
            trace.record_error(str(exc))
            raise GeminiMalformedResponseError("Gemini returned malformed audio analysis.") from exc

        trace.record_success(response.text or str(response.parsed))
        return analysis

    def _build_thinking_config(
        self,
        *,
        model: str,
        thinking_level: ThinkingLevel,
    ) -> types.ThinkingConfig:
        if model.startswith("gemini-3"):
            return types.ThinkingConfig(thinking_level=_THINKING_LEVELS[thinking_level])

        return types.ThinkingConfig(thinking_budget=_THINKING_BUDGETS[thinking_level])


def _extract_provider_message(exc: Exception) -> str | None:
    """Best-effort plain-text message from a provider exception.

    The Google GenAI SDK raises subclasses of ``APIError`` whose ``message``
    attribute carries the provider-supplied text (e.g. quota / availability
    notes). When unavailable, fall back to ``str(exc)`` so we still surface
    something meaningful.
    """
    candidate = getattr(exc, "message", None)
    if isinstance(candidate, str) and candidate.strip():
        return candidate.strip()
    text = str(exc).strip()
    return text or None


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
