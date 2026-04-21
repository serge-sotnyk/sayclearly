from pathlib import Path

from sayclearly.exercise.models import (
    ExerciseGenerationRequest,
    ExerciseGenerationResponse,
)
from sayclearly.storage.files import load_config


class ExerciseService:
    def __init__(self, data_root: Path | None = None) -> None:
        self.data_root = data_root

    def generate_text(
        self, request: ExerciseGenerationRequest
    ) -> ExerciseGenerationResponse:
        topic_prompt = self._resolve_topic(request)
        topic_clause = (
            f" about {topic_prompt}"
            if topic_prompt
            else " for a general speaking warmup"
        )
        text = " ".join(
            [
                f"This placeholder exercise is prepared{topic_clause}.",
                "Read each sentence slowly and let every word land clearly.",
                "Keep your shoulders relaxed and your breathing steady.",
                "Pause briefly at commas and finish each sentence with calm control.",
                "Repeat the passage once more and notice how the rhythm becomes smoother.",
            ]
        )
        return ExerciseGenerationResponse(
            text_language=request.text_language,
            analysis_language=request.analysis_language,
            topic_prompt=topic_prompt,
            text=text,
        )

    def _resolve_topic(self, request: ExerciseGenerationRequest) -> str:
        topic_prompt = request.topic_prompt.strip()
        if topic_prompt:
            return topic_prompt
        if request.reuse_last_topic:
            return load_config(self.data_root).last_topic_prompt
        return ""
