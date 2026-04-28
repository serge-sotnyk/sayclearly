import logging
import os
from collections.abc import Callable, Mapping
from typing import Any

from langfuse import Langfuse

from sayclearly.gemini.catalog import ThinkingLevel

logger = logging.getLogger(__name__)


class GeminiGenerationTrace:
    def __init__(self, observation: object | None = None, client: object | None = None) -> None:
        self._observation = observation
        self._client = client

    def record_success(self, output_text: str) -> None:
        self._update(output=output_text)
        self._end()

    def record_error(self, error_message: str) -> None:
        self._update(level="ERROR", status_message=error_message)
        self._end()

    def _update(self, **kwargs: Any) -> None:
        if self._observation is None:
            return
        try:
            self._observation.update(**kwargs)
        except Exception:
            logger.debug("Langfuse observation update failed", exc_info=True)
            return

    def _end(self) -> None:
        if self._observation is None:
            return
        try:
            self._observation.end()
        except Exception:
            logger.debug("Langfuse observation end failed", exc_info=True)
            return
        self._flush()

    def _flush(self) -> None:
        if self._client is None:
            return
        flush = getattr(self._client, "flush", None)
        if flush is None:
            return
        try:
            flush()
        except Exception:
            logger.debug("Langfuse client flush failed", exc_info=True)
            return


class GeminiTelemetry:
    """Narrow noop-safe boundary for optional model-call tracing."""

    def __init__(
        self,
        *,
        environ: Mapping[str, str] | None = None,
        langfuse_factory: Callable[..., object] | None = None,
    ) -> None:
        self._environ = environ or os.environ
        self._langfuse_factory = langfuse_factory or Langfuse
        self._langfuse_client: object | None = None
        self._client_initialized = False

    def start_text_generation(
        self,
        *,
        prompt: str,
        model: str,
        thinking_level: ThinkingLevel,
        temperature: float | None = None,
    ) -> GeminiGenerationTrace:
        return self._start_generation(
            name="gemini.generate_exercise",
            input_payload=prompt,
            model=model,
            thinking_level=thinking_level,
            temperature=temperature,
        )

    def start_audio_analysis(
        self,
        *,
        prompt: str,
        model: str,
        thinking_level: ThinkingLevel,
        temperature: float | None = None,
        audio_size_bytes: int | None = None,
        content_type: str | None = None,
        language: str | None = None,
        analysis_language: str | None = None,
    ) -> GeminiGenerationTrace:
        input_payload: dict[str, Any] = {"prompt": prompt}
        if audio_size_bytes is not None:
            input_payload["audio_size_bytes"] = audio_size_bytes
        if content_type is not None:
            input_payload["content_type"] = content_type
        if language is not None:
            input_payload["language"] = language
        if analysis_language is not None:
            input_payload["analysis_language"] = analysis_language

        return self._start_generation(
            name="gemini.analyze_audio",
            input_payload=input_payload,
            model=model,
            thinking_level=thinking_level,
            temperature=temperature,
        )

    def _start_generation(
        self,
        *,
        name: str,
        input_payload: object,
        model: str,
        thinking_level: ThinkingLevel,
        temperature: float | None,
    ) -> GeminiGenerationTrace:
        langfuse_client = self._get_langfuse_client()
        if langfuse_client is None:
            return GeminiGenerationTrace()

        model_parameters: dict[str, Any] = {"thinking_level": thinking_level}
        if temperature is not None:
            model_parameters["temperature"] = temperature

        try:
            observation = langfuse_client.start_observation(
                name=name,
                as_type="generation",
                input=input_payload,
                model=model,
                model_parameters=model_parameters,
                metadata={"model": model, **model_parameters},
            )
        except Exception:
            logger.debug("Langfuse start_observation failed", exc_info=True)
            return GeminiGenerationTrace()

        return GeminiGenerationTrace(observation, langfuse_client)

    def _get_langfuse_client(self) -> object | None:
        if self._client_initialized:
            return self._langfuse_client

        self._client_initialized = True
        public_key = self._get_env_value("LANGFUSE_PUBLIC_KEY")
        secret_key = self._get_env_value("LANGFUSE_SECRET_KEY")
        host = self._get_env_value("LANGFUSE_HOST") or self._get_env_value("LANGFUSE_BASE_URL")
        if public_key is None or secret_key is None or host is None:
            return None

        try:
            self._langfuse_client = self._langfuse_factory(
                public_key=public_key,
                secret_key=secret_key,
                base_url=host,
            )
        except Exception:
            logger.debug("Langfuse client initialization failed", exc_info=True)
            self._langfuse_client = None
        return self._langfuse_client

    def _get_env_value(self, name: str) -> str | None:
        value = self._environ.get(name)
        if value is None:
            return None
        stripped_value = value.strip()
        if stripped_value == "":
            return None
        return stripped_value
