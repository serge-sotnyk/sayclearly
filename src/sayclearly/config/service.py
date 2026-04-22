import os
from pathlib import Path
from typing import Literal

from sayclearly.config.models import (
    ConfigSource,
    ConfigUpdatePayload,
    GeminiPublicConfig,
    LangfusePublicConfig,
    PublicConfigView,
)
from sayclearly.gemini.catalog import (
    get_supported_gemini_models,
    sanitize_analysis_model,
    sanitize_text_model,
)
from sayclearly.storage.files import load_config, load_secrets, save_config, save_secrets


class ConfigService:
    def __init__(self, data_root: Path | None = None) -> None:
        self.data_root = data_root

    def get_public_config(self) -> PublicConfigView:
        stored_config = load_config(self.data_root)
        stored_secrets = load_secrets(self.data_root)
        effective_text_model = sanitize_text_model(stored_config.gemini.text_model)
        effective_analysis_model = sanitize_analysis_model(stored_config.gemini.analysis_model)

        gemini_api_key, gemini_source = self._resolve_secret(
            env_name="GEMINI_API_KEY",
            stored_value=stored_secrets.gemini.api_key,
        )
        langfuse_public_key, public_key_source = self._resolve_secret(
            env_name="LANGFUSE_PUBLIC_KEY",
            stored_value=stored_secrets.langfuse.public_key,
        )
        langfuse_secret_key, secret_key_source = self._resolve_secret(
            env_name="LANGFUSE_SECRET_KEY",
            stored_value=stored_secrets.langfuse.secret_key,
        )
        langfuse_host, _ = self._resolve_value(
            env_name="LANGFUSE_HOST",
            stored_value=stored_config.langfuse.host,
        )

        return PublicConfigView(
            version=stored_config.version,
            text_language=stored_config.text_language,
            analysis_language=stored_config.analysis_language,
            same_language_for_analysis=stored_config.same_language_for_analysis,
            ui_language=stored_config.ui_language,
            last_topic_prompt=stored_config.last_topic_prompt,
            session_limit=stored_config.session_limit,
            keep_last_audio=stored_config.keep_last_audio,
            gemini=GeminiPublicConfig(
                text_model=effective_text_model,
                analysis_model=effective_analysis_model,
                same_model_for_analysis=stored_config.gemini.same_model_for_analysis,
                text_thinking_level=stored_config.gemini.text_thinking_level,
                has_api_key=bool(gemini_api_key),
                api_key_source=gemini_source,
                available_models=get_supported_gemini_models(),
            ),
            langfuse=LangfusePublicConfig(
                host=langfuse_host,
                enabled=bool(langfuse_host and langfuse_public_key and langfuse_secret_key),
                has_public_key=bool(langfuse_public_key),
                has_secret_key=bool(langfuse_secret_key),
                public_key_source=public_key_source,
                secret_key_source=secret_key_source,
            ),
        )

    def update_config(self, payload: ConfigUpdatePayload) -> PublicConfigView:
        stored_config = load_config(self.data_root)
        stored_secrets = load_secrets(self.data_root)
        previous_config = stored_config.model_copy(deep=True)

        stored_config.text_language = payload.text_language
        stored_config.analysis_language = payload.analysis_language
        stored_config.same_language_for_analysis = payload.same_language_for_analysis
        stored_config.ui_language = payload.ui_language
        stored_config.last_topic_prompt = payload.last_topic_prompt
        stored_config.session_limit = payload.session_limit
        stored_config.keep_last_audio = payload.keep_last_audio
        stored_config.gemini.text_model = payload.gemini.text_model
        stored_config.gemini.analysis_model = payload.gemini.analysis_model
        stored_config.gemini.same_model_for_analysis = payload.gemini.same_model_for_analysis
        stored_config.gemini.text_thinking_level = payload.gemini.text_thinking_level
        stored_config.langfuse.host = payload.langfuse.host

        if payload.gemini.api_key is not None:
            stored_secrets.gemini.api_key = payload.gemini.api_key
        if payload.langfuse.public_key is not None:
            stored_secrets.langfuse.public_key = payload.langfuse.public_key
        if payload.langfuse.secret_key is not None:
            stored_secrets.langfuse.secret_key = payload.langfuse.secret_key

        save_config(self.data_root, stored_config)
        try:
            save_secrets(self.data_root, stored_secrets)
        except Exception:
            save_config(self.data_root, previous_config)
            raise
        return self.get_public_config()

    def clear_stored_gemini_api_key(self) -> PublicConfigView:
        stored_secrets = load_secrets(self.data_root)
        stored_secrets.gemini.api_key = None
        save_secrets(self.data_root, stored_secrets)
        return self.get_public_config()

    def _resolve_secret(
        self,
        *,
        env_name: str,
        stored_value: str | None,
    ) -> tuple[str | None, ConfigSource]:
        env_value = self._get_env_override(env_name)
        if env_value is not None:
            return env_value, "env"
        if stored_value is not None:
            return stored_value, "stored"
        return None, "none"

    def _resolve_value(
        self,
        *,
        env_name: str,
        stored_value: str | None,
    ) -> tuple[str | None, Literal["env", "stored", "none"]]:
        env_value = self._get_env_override(env_name)
        if env_value is not None:
            return env_value, "env"
        if stored_value is not None:
            return stored_value, "stored"
        return None, "none"

    def _get_env_override(self, env_name: str) -> str | None:
        env_value = os.getenv(env_name)
        if env_value is None:
            return None
        if env_value.strip() == "":
            return ""
        return env_value
