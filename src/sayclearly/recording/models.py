from pydantic import BaseModel, ConfigDict, Field


class RecordingAnalysisResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str
    clarity: str
    pace: str
    hesitations: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
