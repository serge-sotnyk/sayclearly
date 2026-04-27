import logging
from pathlib import Path

from sayclearly.config.service import resolve_gemini_api_key
from sayclearly.exercise.models import (
    ExerciseGenerationContext,
    ExerciseGenerationRequest,
    ExerciseGenerationResponse,
)
from sayclearly.exercise.prompts import build_exercise_generation_prompt
from sayclearly.gemini.catalog import sanitize_text_model
from sayclearly.gemini.client import (
    GeminiClient,
    GeminiInvalidCredentialsError,
    GeminiMalformedResponseError,
    GeminiProviderError,
    MissingGeminiApiKeyError,
)
from sayclearly.gemini.telemetry import GeminiTelemetry
from sayclearly.storage.files import load_config, load_history

logger = logging.getLogger(__name__)


class ExerciseServiceError(RuntimeError):
    """Raised when exercise generation fails."""


class ExerciseServiceConfigurationError(ExerciseServiceError):
    """Raised when local configuration is missing required generation settings."""


class ExerciseGenerationProviderError(ExerciseServiceError):
    """Raised when exercise generation is unavailable from the provider."""


class ExerciseGenerationInvalidCredentialsError(ExerciseServiceError):
    """Raised when the configured Gemini credentials are rejected."""


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
        topic_prompt = request.topic_prompt.strip()
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
                model=sanitize_text_model(config.gemini.text_model),
                thinking_level=config.gemini.text_thinking_level,
            )
        except MissingGeminiApiKeyError as exc:
            raise ExerciseServiceConfigurationError(
                "Gemini API key is required before generating text."
            ) from exc
        except GeminiInvalidCredentialsError as exc:
            raise ExerciseGenerationInvalidCredentialsError(
                "Gemini API key was rejected. Update it and try again."
            ) from exc
        except GeminiMalformedResponseError as exc:
            raise ExerciseGenerationProviderError("Gemini: returned a malformed response.") from exc
        except GeminiProviderError as exc:
            raise ExerciseGenerationProviderError(f"Gemini: {exc}") from exc
        except Exception as exc:
            logger.exception("Unexpected error while generating exercise text")
            raise ExerciseGenerationProviderError(f"Gemini: {exc}") from exc

        return ExerciseGenerationResponse(
            language=request.language,
            analysis_language=request.analysis_language,
            topic_prompt=topic_prompt,
            text=generated_exercise.text,
        )

    def _build_gemini_client(self) -> GeminiClient:
        api_key = resolve_gemini_api_key(self.data_root)
        if api_key is None:
            raise ExerciseServiceConfigurationError(
                "Gemini API key is required before generating text."
            )

        return GeminiClient(api_key=api_key, telemetry=self.telemetry)

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
