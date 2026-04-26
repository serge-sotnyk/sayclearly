from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    computed_field,
    field_validator,
    model_validator,
)

from sayclearly.gemini.catalog import (
    PRODUCT_DEFAULT_TEXT_THINKING_LEVEL,
    GeminiModelCatalogEntry,
    ThinkingLevel,
    is_supported_gemini_model,
)

ConfigSource = Literal["env", "stored", "none"]
NonEmptyString = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class GeminiConfigUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text_model: NonEmptyString
    analysis_model: NonEmptyString
    same_model_for_analysis: bool
    text_thinking_level: ThinkingLevel
    api_key: NonEmptyString | None = None

    @model_validator(mode="before")
    @classmethod
    def expand_legacy_model_field(cls, value: object) -> object:
        if not isinstance(value, dict) or "model" not in value:
            return value

        legacy_model = value.get("model")
        normalized_value = dict(value)
        normalized_value.pop("model", None)

        if legacy_model is not None:
            normalized_value.setdefault("text_model", legacy_model)
            normalized_value.setdefault("analysis_model", legacy_model)
            normalized_value.setdefault("same_model_for_analysis", True)
            normalized_value.setdefault(
                "text_thinking_level",
                PRODUCT_DEFAULT_TEXT_THINKING_LEVEL,
            )

        return normalized_value

    @field_validator("text_model", "analysis_model")
    @classmethod
    def validate_supported_model(cls, value: str) -> str:
        if not is_supported_gemini_model(value):
            raise ValueError("Unsupported Gemini model")
        return value


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

    text_model: str
    analysis_model: str
    same_model_for_analysis: bool
    text_thinking_level: ThinkingLevel
    has_api_key: bool
    api_key_source: ConfigSource
    available_models: list[GeminiModelCatalogEntry]

    @computed_field
    @property
    def model(self) -> str:
        return self.text_model


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
