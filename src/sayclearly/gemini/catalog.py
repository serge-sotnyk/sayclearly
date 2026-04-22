import os
from typing import Literal, TypedDict

ThinkingLevel = Literal["low", "medium", "high"]

PRODUCT_DEFAULT_TEXT_MODEL = "gemini-3-flash"
PRODUCT_DEFAULT_ANALYSIS_MODEL = PRODUCT_DEFAULT_TEXT_MODEL
PRODUCT_DEFAULT_TEXT_THINKING_LEVEL: ThinkingLevel = "high"


class GeminiModelCatalogEntry(TypedDict):
    id: str
    label: str
    free_tier_requests_per_day_hint: int | None


SUPPORTED_GEMINI_MODELS: tuple[GeminiModelCatalogEntry, ...] = (
    {
        "id": "gemini-3-flash",
        "label": "Gemini 3 Flash",
        "free_tier_requests_per_day_hint": None,
    },
    {
        "id": "gemini-3.1-flash-lite-preview",
        "label": "Gemini 3.1 Flash-Lite Preview",
        "free_tier_requests_per_day_hint": None,
    },
    {
        "id": "gemini-2.5-flash",
        "label": "Gemini 2.5 Flash",
        "free_tier_requests_per_day_hint": 250,
    },
    {
        "id": "gemini-2.5-flash-lite",
        "label": "Gemini 2.5 Flash-Lite",
        "free_tier_requests_per_day_hint": 1000,
    },
)


def get_default_text_model() -> str:
    return _get_non_empty_env("SAYCLEARLY_DEFAULT_TEXT_MODEL") or PRODUCT_DEFAULT_TEXT_MODEL


def get_default_analysis_model() -> str:
    return (
        _get_non_empty_env("SAYCLEARLY_DEFAULT_ANALYSIS_MODEL")
        or _get_non_empty_env("SAYCLEARLY_DEFAULT_TEXT_MODEL")
        or PRODUCT_DEFAULT_ANALYSIS_MODEL
    )


def get_supported_gemini_models() -> list[GeminiModelCatalogEntry]:
    return [entry.copy() for entry in SUPPORTED_GEMINI_MODELS]


def _get_non_empty_env(name: str) -> str | None:
    value = os.getenv(name)
    if value is None:
        return None
    stripped_value = value.strip()
    return stripped_value or None
