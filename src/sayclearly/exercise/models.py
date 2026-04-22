from pydantic import BaseModel, ConfigDict, Field


class ExerciseGenerationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    language: str
    analysis_language: str
    topic_prompt: str
    reuse_last_topic: bool


class ExerciseGenerationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    language: str
    analysis_language: str
    topic_prompt: str
    text: str


class ExerciseGenerationContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    language: str
    topic_prompt: str
    recent_texts: list[str] = Field(default_factory=list)
