from sayclearly.gemini.catalog import ThinkingLevel


class GeminiGenerationTrace:
    def record_success(self, output_text: str) -> None:
        return None

    def record_error(self, error_message: str) -> None:
        return None


class GeminiTelemetry:
    """Narrow noop-safe boundary for optional model-call tracing."""

    def start_text_generation(
        self,
        *,
        model: str,
        thinking_level: ThinkingLevel,
    ) -> GeminiGenerationTrace:
        return GeminiGenerationTrace()
