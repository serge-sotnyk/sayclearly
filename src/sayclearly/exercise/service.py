import os
from pathlib import Path

from sayclearly.exercise.models import (
    ExerciseGenerationContext,
    ExerciseGenerationRequest,
    ExerciseGenerationResponse,
)
from sayclearly.exercise.prompts import build_exercise_generation_prompt
from sayclearly.gemini.client import (
    GeminiClient,
    GeminiMalformedResponseError,
    MissingGeminiApiKeyError,
)
from sayclearly.gemini.telemetry import GeminiTelemetry
from sayclearly.storage.files import load_config, load_history, load_secrets


class ExerciseServiceError(RuntimeError):
    """Raised when exercise generation fails."""


class ExerciseServiceConfigurationError(ExerciseServiceError):
    """Raised when local configuration is missing required generation settings."""


class ExerciseGenerationProviderError(ExerciseServiceError):
    """Raised when exercise generation is unavailable from the provider."""


class ExerciseService:
    def __init__(
        self,
        data_root: Path | None = None,
        *,
        gemini_client: GeminiClient | object | None = None,
        telemetry: GeminiTelemetry | None = None,
    ) -> None:
        self.data_root = data_root
        self.gemini_client = gemini_client
        self.telemetry = telemetry or GeminiTelemetry()

    def generate_text(self, request: ExerciseGenerationRequest) -> ExerciseGenerationResponse:
        topic_prompt = self._resolve_topic(request)
        generation_context = ExerciseGenerationContext(
            language=request.language,
            topic_prompt=topic_prompt,
            recent_texts=self._load_recent_texts(request.language),
        )
        prompt = build_exercise_generation_prompt(
            language=generation_context.language,
            topic_prompt=generation_context.topic_prompt,
            recent_texts=generation_context.recent_texts,
        )

        config = load_config(self.data_root)
        client = self.gemini_client or self._build_gemini_client()

        try:
            generated_exercise = client.generate_exercise(
                prompt=prompt,
                model=config.gemini.text_model,
                thinking_level=config.gemini.text_thinking_level,
            )
        except MissingGeminiApiKeyError as exc:
            raise ExerciseServiceConfigurationError(
                "Gemini API key is required before generating text."
            ) from exc
        except GeminiMalformedResponseError as exc:
            raise ExerciseGenerationProviderError(
                "Text generation is unavailable right now. Please try again."
            ) from exc
        except Exception as exc:
            raise ExerciseGenerationProviderError(
                "Text generation is unavailable right now. Please try again."
            ) from exc

        return ExerciseGenerationResponse(
            language=request.language,
            analysis_language=request.analysis_language,
            topic_prompt=topic_prompt,
            text=generated_exercise.text,
        )

    def _resolve_topic(self, request: ExerciseGenerationRequest) -> str:
        topic_prompt = request.topic_prompt.strip()
        if topic_prompt:
            return topic_prompt
        if request.reuse_last_topic:
            return load_config(self.data_root).last_topic_prompt
        return ""

    def _build_gemini_client(self) -> GeminiClient:
        api_key = self._resolve_gemini_api_key()
        if api_key is None:
            raise ExerciseServiceConfigurationError(
                "Gemini API key is required before generating text."
            )

        return GeminiClient(api_key=api_key, telemetry=self.telemetry)

    def _resolve_gemini_api_key(self) -> str | None:
        env_api_key = os.getenv("GEMINI_API_KEY")
        if env_api_key and env_api_key.strip():
            return env_api_key.strip()

        stored_api_key = load_secrets(self.data_root).gemini.api_key
        if stored_api_key and stored_api_key.strip():
            return stored_api_key.strip()
        return None

    def _load_recent_texts(self, language: str) -> list[str]:
        history = load_history(self.data_root)
        recent_texts: list[str] = []

        for session in history.sessions:
            if session.language != language:
                continue
            text = session.text.strip()
            if text:
                recent_texts.append(text)
            if len(recent_texts) == 3:
                break

        return recent_texts
