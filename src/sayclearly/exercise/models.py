from pydantic import BaseModel, ConfigDict


class ExerciseGenerationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text_language: str
    analysis_language: str
    topic_prompt: str
    reuse_last_topic: bool


class ExerciseGenerationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text_language: str
    analysis_language: str
    topic_prompt: str
    text: str
