from pydantic import BaseModel, ConfigDict, Field

from sayclearly.storage.models import Hesitation, SessionAnalysis


class AudioAnalysisMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    language: str
    analysis_language: str
    exercise_text: str


class StructuredAudioAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid")

    clarity_score: int = Field(ge=0, le=100)
    clarity_comment: str = ""
    pace_score: int = Field(ge=0, le=100)
    pace_comment: str = ""
    hesitations: list[Hesitation] = Field(default_factory=list)
    summary: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)


class RecordingReview(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str
    clarity: str
    pace: str
    hesitations: list[Hesitation] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)


class RecordingAnalysisResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    review: RecordingReview
    analysis: SessionAnalysis
