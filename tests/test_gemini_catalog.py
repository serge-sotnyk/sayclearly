from sayclearly.gemini.catalog import (
    PRODUCT_DEFAULT_ANALYSIS_MODEL,
    PRODUCT_DEFAULT_TEXT_MODEL,
    get_supported_gemini_models,
)


def test_catalog_uses_verified_gemini_3_flash_preview_id() -> None:
    assert PRODUCT_DEFAULT_TEXT_MODEL == "gemini-3-flash-preview"
    assert PRODUCT_DEFAULT_ANALYSIS_MODEL == "gemini-3-flash-preview"

    first_supported_model = get_supported_gemini_models()[0]
    assert first_supported_model == {
        "id": "gemini-3-flash-preview",
        "label": "Gemini 3 Flash",
        "free_tier_requests_per_day_hint": None,
    }
