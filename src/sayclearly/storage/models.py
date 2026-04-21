import re
from datetime import datetime
from typing import ClassVar, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class GeminiConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model: str = "gemini-2.5-flash"


class LangfuseConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    host: str | None = None


class StoredConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Literal[1] = 1
    text_language: str = "uk"
    analysis_language: str = "uk"
    ui_language: str = "en"
    same_language_for_analysis: bool = True
    last_topic_prompt: str = ""
    session_limit: int = Field(default=300, gt=0)
    keep_last_audio: bool = False
    gemini: GeminiConfig = Field(default_factory=GeminiConfig)
    langfuse: LangfuseConfig = Field(default_factory=LangfuseConfig)


class GeminiSecrets(BaseModel):
    model_config = ConfigDict(extra="forbid")

    api_key: str | None = None


class LangfuseSecrets(BaseModel):
    model_config = ConfigDict(extra="forbid")

    public_key: str | None = None
    secret_key: str | None = None


class StoredSecrets(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Literal[1] = 1
    gemini: GeminiSecrets = Field(default_factory=GeminiSecrets)
    langfuse: LangfuseSecrets = Field(default_factory=LangfuseSecrets)


class Hesitation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start: float
    end: float
    note: str

    @model_validator(mode="after")
    def validate_time_range(self) -> "Hesitation":
        if self.end < self.start:
            raise ValueError("Hesitation end must not be earlier than start")
        return self


class SessionAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid")

    clarity_score: int = Field(ge=0, le=100)
    pace_score: int = Field(ge=0, le=100)
    hesitations: list[Hesitation] = Field(default_factory=list)
    summary: list[str] = Field(default_factory=list)


class HistorySession(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    created_at: str
    language: str
    topic_prompt: str | None = None
    text: str
    analysis: SessionAnalysis

    _CREATED_AT_PATTERN: ClassVar[re.Pattern[str]] = re.compile(
        r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$"
    )

    @field_validator("created_at")
    @classmethod
    def validate_created_at(cls, value: str) -> str:
        if not cls._CREATED_AT_PATTERN.fullmatch(value):
            raise ValueError("created_at must be a valid ISO 8601 timestamp")

        normalized_value = value[:-1] + "+00:00" if value.endswith("Z") else value

        try:
            datetime.fromisoformat(normalized_value)
        except ValueError as exc:
            raise ValueError("created_at must be a valid ISO 8601 timestamp") from exc

        return value


class HistoryStore(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Literal[1] = 1
    sessions: list[HistorySession] = Field(default_factory=list)
