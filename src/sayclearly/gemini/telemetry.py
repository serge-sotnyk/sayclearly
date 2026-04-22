import os
from collections.abc import Callable, Mapping
from typing import Any

from langfuse import Langfuse

from sayclearly.gemini.catalog import ThinkingLevel


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
            return

    def _end(self) -> None:
        if self._observation is None:
            return
        try:
            self._observation.end()
        except Exception:
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
    ) -> GeminiGenerationTrace:
        langfuse_client = self._get_langfuse_client()
        if langfuse_client is None:
            return GeminiGenerationTrace()

        try:
            observation = langfuse_client.start_observation(
                name="gemini.generate_exercise",
                as_type="generation",
                input=prompt,
                model=model,
                model_parameters={"thinking_level": thinking_level},
            )
        except Exception:
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
