import os
from pathlib import Path

from sayclearly.config.models import (
    ConfigSource,
    ConfigUpdatePayload,
    GeminiPublicConfig,
    LangfusePublicConfig,
    PublicConfigView,
)
from sayclearly.gemini.catalog import (
    PRODUCT_DEFAULT_ANALYSIS_MODEL,
    PRODUCT_DEFAULT_TEXT_MODEL,
    get_default_analysis_model,
    get_default_text_model,
    get_supported_gemini_models,
    is_supported_gemini_model,
    sanitize_analysis_model,
    sanitize_text_model,
)
from sayclearly.storage.files import load_config, load_secrets, save_config, save_secrets


def resolve_gemini_api_key(data_root: Path | None = None) -> str | None:
    """Return the active Gemini API key from env override or stored secrets."""
    env_api_key = os.getenv("GEMINI_API_KEY")
    if env_api_key and env_api_key.strip():
        return env_api_key.strip()

    stored_api_key = load_secrets(data_root).gemini.api_key
    if stored_api_key and stored_api_key.strip():
        return stored_api_key.strip()
    return None


class ConfigService:
    def __init__(self, data_root: Path | None = None) -> None:
        self.data_root = data_root

    def get_public_config(self) -> PublicConfigView:
        stored_config = load_config(self.data_root)
        stored_secrets = load_secrets(self.data_root)
        effective_text_model = self._resolve_effective_text_model(stored_config.gemini.text_model)
        effective_analysis_model = self._resolve_effective_analysis_model(
            stored_config.gemini.analysis_model
        )

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
        langfuse_host = self._resolve_langfuse_host(stored_config.langfuse.host)

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
                enabled=self._is_langfuse_runtime_enabled(),
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

    def _resolve_effective_text_model(self, stored_model: str) -> str:
        if stored_model != PRODUCT_DEFAULT_TEXT_MODEL:
            return sanitize_text_model(stored_model)

        env_default = get_default_text_model()
        if is_supported_gemini_model(env_default):
            return env_default
        return PRODUCT_DEFAULT_TEXT_MODEL

    def _resolve_effective_analysis_model(self, stored_model: str) -> str:
        if stored_model != PRODUCT_DEFAULT_ANALYSIS_MODEL:
            return sanitize_analysis_model(stored_model)

        env_default = get_default_analysis_model()
        if is_supported_gemini_model(env_default):
            return env_default
        return PRODUCT_DEFAULT_ANALYSIS_MODEL

    def _resolve_langfuse_host(self, stored_value: str | None) -> str | None:
        host = self._get_env_override("LANGFUSE_HOST")
        if host is not None:
            return host

        base_url = self._get_env_override("LANGFUSE_BASE_URL")
        if base_url is not None:
            return base_url

        return stored_value

    def _get_env_override(self, env_name: str) -> str | None:
        env_value = os.getenv(env_name)
        if env_value is None:
            return None
        if env_value.strip() == "":
            return None
        return env_value

    def _is_langfuse_runtime_enabled(self) -> bool:
        return bool(
            (self._get_env_override("LANGFUSE_HOST") or self._get_env_override("LANGFUSE_BASE_URL"))
            and self._get_env_override("LANGFUSE_PUBLIC_KEY")
            and self._get_env_override("LANGFUSE_SECRET_KEY")
        )
