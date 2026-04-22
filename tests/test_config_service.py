import json
from pathlib import Path

import pytest
from pydantic import ValidationError

import sayclearly.config.service as config_service_module
from sayclearly.config.models import ConfigUpdatePayload
from sayclearly.config.service import ConfigService


def make_payload(**overrides: object) -> ConfigUpdatePayload:
    payload = {
        "text_language": "en",
        "analysis_language": "uk",
        "same_language_for_analysis": False,
        "ui_language": "en",
        "last_topic_prompt": "interesting facts about astronomy",
        "session_limit": 123,
        "keep_last_audio": True,
        "gemini": {
            "text_model": "gemini-3-flash-preview",
            "analysis_model": "gemini-3.1-flash-lite-preview",
            "same_model_for_analysis": False,
            "text_thinking_level": "medium",
            "api_key": "stored-gemini",
        },
        "langfuse": {
            "host": "https://langfuse.example",
            "public_key": "stored-public",
            "secret_key": "stored-secret",
        },
    }
    payload.update(overrides)
    return ConfigUpdatePayload.model_validate(payload)


@pytest.mark.parametrize("session_limit", [0, -1])
def test_update_payload_rejects_invalid_session_limit_values(session_limit: int) -> None:
    with pytest.raises(ValidationError, match="session_limit"):
        make_payload(session_limit=session_limit)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("text_language", ""),
        ("analysis_language", ""),
        ("ui_language", ""),
        ("text_language", "   \t"),
        ("analysis_language", "\n"),
        ("ui_language", "  "),
    ],
)
def test_update_payload_rejects_empty_language_fields(field: str, value: str) -> None:
    with pytest.raises(ValidationError, match=field):
        make_payload(**{field: value})


@pytest.mark.parametrize(
    ("field", "value"),
    [
        (
            "gemini",
            {
                "text_model": "",
                "analysis_model": "gemini-3-flash-preview",
                "same_model_for_analysis": True,
                "text_thinking_level": "high",
                "api_key": "stored-gemini",
            },
        ),
        (
            "langfuse",
            {
                "host": "",
                "public_key": "stored-public",
                "secret_key": "stored-secret",
            },
        ),
        (
            "gemini",
            {
                "text_model": "gemini-3-flash-preview",
                "analysis_model": "gemini-3-flash-preview",
                "same_model_for_analysis": True,
                "text_thinking_level": "high",
                "api_key": "",
            },
        ),
        (
            "gemini",
            {
                "text_model": "   ",
                "analysis_model": "gemini-3-flash-preview",
                "same_model_for_analysis": True,
                "text_thinking_level": "high",
                "api_key": "stored-gemini",
            },
        ),
        (
            "gemini",
            {
                "text_model": "gemini-3-flash-preview",
                "analysis_model": "gemini-3-flash-preview",
                "same_model_for_analysis": True,
                "text_thinking_level": "high",
                "api_key": "\t",
            },
        ),
        (
            "langfuse",
            {
                "host": "https://langfuse.example",
                "public_key": "",
                "secret_key": "stored-secret",
            },
        ),
        (
            "langfuse",
            {
                "host": "https://langfuse.example",
                "public_key": "stored-public",
                "secret_key": "",
            },
        ),
        (
            "langfuse",
            {
                "host": "  ",
                "public_key": "stored-public",
                "secret_key": "stored-secret",
            },
        ),
        (
            "langfuse",
            {
                "host": "https://langfuse.example",
                "public_key": "\n",
                "secret_key": "stored-secret",
            },
        ),
        (
            "langfuse",
            {
                "host": "https://langfuse.example",
                "public_key": "stored-public",
                "secret_key": " ",
            },
        ),
    ],
)
def test_update_payload_rejects_empty_provider_values(field: str, value: object) -> None:
    with pytest.raises(ValidationError):
        make_payload(**{field: value})


def test_update_payload_accepts_legacy_gemini_model_field() -> None:
    payload = make_payload(
        gemini={
            "model": "gemini-3.1-flash-lite-preview",
            "api_key": None,
        }
    )

    assert payload.gemini.text_model == "gemini-3.1-flash-lite-preview"
    assert payload.gemini.analysis_model == "gemini-3.1-flash-lite-preview"
    assert payload.gemini.same_model_for_analysis is True


def test_get_public_config_hides_secrets_and_reports_effective_sources(
    tmp_path: Path,
    monkeypatch,
) -> None:
    service = ConfigService(tmp_path)
    service.update_config(make_payload())
    monkeypatch.setenv("GEMINI_API_KEY", "env-gemini")
    monkeypatch.setenv("LANGFUSE_HOST", "https://env-langfuse.example")

    public = service.get_public_config()

    assert public.text_language == "en"
    assert public.gemini.text_model == "gemini-3-flash-preview"
    assert public.gemini.analysis_model == "gemini-3.1-flash-lite-preview"
    assert public.gemini.same_model_for_analysis is False
    assert public.gemini.text_thinking_level == "medium"
    assert public.gemini.has_api_key is True
    assert public.gemini.api_key_source == "env"
    assert public.gemini.available_models[0]["id"] == "gemini-3-flash-preview"
    assert public.langfuse.host == "https://env-langfuse.example"
    assert public.langfuse.has_public_key is True
    assert public.langfuse.public_key_source == "stored"
    assert public.langfuse.has_secret_key is True
    assert public.langfuse.secret_key_source == "stored"
    assert public.langfuse.enabled is False
    assert public.model_dump()["gemini"] == {
        "model": "gemini-3-flash-preview",
        "text_model": "gemini-3-flash-preview",
        "analysis_model": "gemini-3.1-flash-lite-preview",
        "same_model_for_analysis": False,
        "text_thinking_level": "medium",
        "has_api_key": True,
        "api_key_source": "env",
        "available_models": public.gemini.available_models,
    }


def test_get_public_config_enables_langfuse_only_when_env_runtime_is_complete(
    tmp_path: Path,
    monkeypatch,
) -> None:
    service = ConfigService(tmp_path)
    service.update_config(make_payload())
    monkeypatch.setenv("LANGFUSE_HOST", "https://env-langfuse.example")
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "env-public")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "env-secret")

    public = service.get_public_config()

    assert public.langfuse.enabled is True
    assert public.langfuse.public_key_source == "env"
    assert public.langfuse.secret_key_source == "env"


def test_get_public_config_uses_env_defaults_when_storage_is_missing(
    tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.setenv("SAYCLEARLY_DEFAULT_TEXT_MODEL", "gemini-3.1-flash-lite-preview")

    public = ConfigService(tmp_path).get_public_config()

    assert public.gemini.text_model == "gemini-3.1-flash-lite-preview"
    assert public.gemini.analysis_model == "gemini-3.1-flash-lite-preview"


def test_get_public_config_uses_explicit_analysis_env_default(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("SAYCLEARLY_DEFAULT_TEXT_MODEL", "gemini-3-flash-preview")
    monkeypatch.setenv("SAYCLEARLY_DEFAULT_ANALYSIS_MODEL", "gemini-3.1-flash-lite-preview")

    public = ConfigService(tmp_path).get_public_config()

    assert public.gemini.text_model == "gemini-3-flash-preview"
    assert public.gemini.analysis_model == "gemini-3.1-flash-lite-preview"


def test_get_public_config_sanitizes_unsupported_stored_gemini_models(tmp_path: Path) -> None:
    service = ConfigService(tmp_path)
    service.update_config(make_payload())
    config_path = tmp_path / "config.json"
    payload = json.loads(config_path.read_text(encoding="utf-8"))
    payload["gemini"]["text_model"] = "gemini-1.5-pro"
    payload["gemini"]["analysis_model"] = "custom-hand-edited-model"
    config_path.write_text(json.dumps(payload), encoding="utf-8")

    public = service.get_public_config()

    assert public.gemini.text_model == "gemini-3-flash-preview"
    assert public.gemini.analysis_model == "gemini-3-flash-preview"


def test_update_config_persists_public_and_secret_values_in_separate_files(tmp_path: Path) -> None:
    service = ConfigService(tmp_path)

    public = service.update_config(make_payload())

    assert public.session_limit == 123
    assert (
        json.loads((tmp_path / "config.json").read_text(encoding="utf-8"))["session_limit"] == 123
    )
    assert json.loads((tmp_path / "config.json").read_text(encoding="utf-8"))["gemini"] == {
        "text_model": "gemini-3-flash-preview",
        "analysis_model": "gemini-3.1-flash-lite-preview",
        "same_model_for_analysis": False,
        "text_thinking_level": "medium",
    }
    assert json.loads((tmp_path / "secrets.json").read_text(encoding="utf-8"))["gemini"] == {
        "api_key": "stored-gemini"
    }


def test_update_config_keeps_existing_secrets_when_null_fields_are_sent(tmp_path: Path) -> None:
    service = ConfigService(tmp_path)
    service.update_config(make_payload())

    public = service.update_config(
        make_payload(
            gemini={
                "text_model": "gemini-3-flash-preview",
                "analysis_model": "gemini-3-flash-preview",
                "same_model_for_analysis": True,
                "text_thinking_level": "low",
                "api_key": None,
            },
            langfuse={
                "host": "https://langfuse.example",
                "public_key": None,
                "secret_key": None,
            },
        )
    )

    assert public.gemini.text_model == "gemini-3-flash-preview"
    assert public.gemini.analysis_model == "gemini-3-flash-preview"
    assert public.gemini.same_model_for_analysis is True
    assert public.gemini.text_thinking_level == "low"
    assert public.gemini.has_api_key is True
    assert public.langfuse.has_public_key is True
    assert public.langfuse.has_secret_key is True
    assert json.loads((tmp_path / "secrets.json").read_text(encoding="utf-8")) == {
        "version": 1,
        "gemini": {"api_key": "stored-gemini"},
        "langfuse": {
            "public_key": "stored-public",
            "secret_key": "stored-secret",
        },
    }


def test_update_config_rolls_back_public_config_when_secret_write_fails(
    tmp_path: Path,
    monkeypatch,
) -> None:
    service = ConfigService(tmp_path)
    service.update_config(make_payload())
    previous_config = json.loads((tmp_path / "config.json").read_text(encoding="utf-8"))
    previous_secrets = json.loads((tmp_path / "secrets.json").read_text(encoding="utf-8"))
    original_save_secrets = config_service_module.save_secrets

    def failing_save_secrets(data_root: Path | None, secrets) -> None:
        raise OSError("simulated secrets write failure")

    monkeypatch.setattr(config_service_module, "save_secrets", failing_save_secrets)

    with pytest.raises(OSError, match="simulated secrets write failure"):
        service.update_config(
            make_payload(
                text_language="de",
                gemini={
                    "text_model": "gemini-3.1-flash-lite-preview",
                    "analysis_model": "gemini-3-flash-preview",
                    "same_model_for_analysis": False,
                    "text_thinking_level": "high",
                    "api_key": "replacement-gemini",
                },
            )
        )

    assert json.loads((tmp_path / "config.json").read_text(encoding="utf-8")) == previous_config
    assert json.loads((tmp_path / "secrets.json").read_text(encoding="utf-8")) == previous_secrets
    monkeypatch.setattr(config_service_module, "save_secrets", original_save_secrets)


def test_clear_stored_gemini_api_key_keeps_environment_override_effective(
    tmp_path: Path,
    monkeypatch,
) -> None:
    service = ConfigService(tmp_path)
    service.update_config(make_payload())
    monkeypatch.setenv("GEMINI_API_KEY", "env-gemini")

    public = service.clear_stored_gemini_api_key()

    assert public.gemini.has_api_key is True
    assert public.gemini.api_key_source == "env"
    assert json.loads((tmp_path / "secrets.json").read_text(encoding="utf-8"))["gemini"] == {}


def test_empty_string_environment_override_disables_stored_values(
    tmp_path: Path,
    monkeypatch,
) -> None:
    service = ConfigService(tmp_path)
    service.update_config(make_payload())
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("LANGFUSE_HOST", "")

    public = service.get_public_config()

    assert public.gemini.has_api_key is False
    assert public.gemini.api_key_source == "env"
    assert public.langfuse.host == ""
    assert public.langfuse.enabled is False


def test_whitespace_only_environment_override_disables_stored_values(
    tmp_path: Path,
    monkeypatch,
) -> None:
    service = ConfigService(tmp_path)
    service.update_config(make_payload())
    monkeypatch.setenv("GEMINI_API_KEY", "   \t")
    monkeypatch.setenv("LANGFUSE_HOST", "  \n")

    public = service.get_public_config()

    assert public.gemini.has_api_key is False
    assert public.gemini.api_key_source == "env"
    assert public.langfuse.host == ""
    assert public.langfuse.enabled is False
