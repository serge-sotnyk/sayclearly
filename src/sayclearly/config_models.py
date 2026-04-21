from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

ConfigSource = Literal["env", "stored", "none"]
NonEmptyString = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class GeminiConfigUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model: NonEmptyString
    api_key: NonEmptyString | None = None


class LangfuseConfigUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    host: NonEmptyString | None = None
    public_key: NonEmptyString | None = None
    secret_key: NonEmptyString | None = None


class ConfigUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text_language: NonEmptyString
    analysis_language: NonEmptyString
    same_language_for_analysis: bool
    ui_language: NonEmptyString
    last_topic_prompt: str
    session_limit: int = Field(gt=0)
    keep_last_audio: bool
    gemini: GeminiConfigUpdate
    langfuse: LangfuseConfigUpdate


class GeminiPublicConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model: str
    has_api_key: bool
    api_key_source: ConfigSource


class LangfusePublicConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    host: str | None
    enabled: bool
    has_public_key: bool
    has_secret_key: bool
    public_key_source: ConfigSource
    secret_key_source: ConfigSource


class PublicConfigView(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int
    text_language: str
    analysis_language: str
    same_language_for_analysis: bool
    ui_language: str
    last_topic_prompt: str
    session_limit: int
    keep_last_audio: bool
    gemini: GeminiPublicConfig
    langfuse: LangfusePublicConfig
