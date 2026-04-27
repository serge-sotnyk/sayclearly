import json
import os
import tempfile
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ValidationError

from sayclearly.gemini.catalog import (
    PRODUCT_DEFAULT_ANALYSIS_MODEL,
    PRODUCT_DEFAULT_TEXT_MODEL,
    PRODUCT_DEFAULT_TEXT_THINKING_LEVEL,
)
from sayclearly.storage.models import HistoryStore, StoredConfig, StoredSecrets

APP_DIR_NAME = ".sayclearly"
CONFIG_FILE_NAME = "config.json"
SECRETS_FILE_NAME = "secrets.json"
HISTORY_FILE_NAME = "history.json"
CACHE_DIR_NAME = "cache"


class StorageError(RuntimeError):
    """Raised when local storage cannot be read or written safely."""


def default_data_root() -> Path:
    return Path.home() / APP_DIR_NAME


def ensure_storage_root(data_root: Path | None = None) -> Path:
    root = data_root or default_data_root()

    try:
        root.mkdir(parents=True, exist_ok=True)
        (root / CACHE_DIR_NAME).mkdir(exist_ok=True)
    except OSError as exc:
        raise StorageError(f"Could not create storage root at {root}") from exc

    _ensure_default_file(root / CONFIG_FILE_NAME, _build_product_default_config())
    _ensure_default_file(root / SECRETS_FILE_NAME, StoredSecrets())
    _ensure_default_file(root / HISTORY_FILE_NAME, HistoryStore())
    return root


def atomic_write_json(path: Path, data: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_path = tempfile.mkstemp(
        dir=path.parent,
        prefix=f".{path.name}.",
        suffix=".tmp",
    )

    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(temporary_path, path)
    except OSError as exc:
        raise StorageError(f"Could not write {path}") from exc
    finally:
        if os.path.exists(temporary_path):
            os.unlink(temporary_path)


def _ensure_default_file(path: Path, model: BaseModel) -> None:
    if path.exists():
        return

    atomic_write_json(path, model.model_dump(mode="json", exclude_none=True))


def _build_product_default_config() -> StoredConfig:
    return StoredConfig.model_validate(
        {
            "version": 2,
            "text_language": "uk",
            "analysis_language": "uk",
            "ui_language": "en",
            "same_language_for_analysis": True,
            "session_limit": 300,
            "keep_last_audio": False,
            "gemini": {
                "text_model": PRODUCT_DEFAULT_TEXT_MODEL,
                "analysis_model": PRODUCT_DEFAULT_ANALYSIS_MODEL,
                "same_model_for_analysis": True,
                "text_thinking_level": PRODUCT_DEFAULT_TEXT_THINKING_LEVEL,
            },
            "langfuse": {},
        }
    )


def _load_model[ModelT: BaseModel](
    path: Path,
    model_type: type[ModelT],
    default_model: ModelT,
) -> ModelT:
    if not path.exists():
        atomic_write_json(path, default_model.model_dump(mode="json", exclude_none=True))
        return default_model

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise StorageError(f"Invalid JSON in {path}") from exc
    except UnicodeDecodeError as exc:
        raise StorageError(f"Could not read {path}") from exc
    except OSError as exc:
        raise StorageError(f"Could not read {path}") from exc

    try:
        return model_type.model_validate(payload)
    except ValidationError as exc:
        raise StorageError(f"Invalid data in {path}") from exc


def load_config(data_root: Path | None = None) -> StoredConfig:
    root = ensure_storage_root(data_root)
    path = root / CONFIG_FILE_NAME
    default_config = StoredConfig()

    if not path.exists():
        product_default_config = _build_product_default_config()
        atomic_write_json(path, product_default_config.model_dump(mode="json", exclude_none=True))
        return product_default_config

    payload = _load_json_payload(path)
    migrated_payload = _migrate_config_payload(payload, default_config)
    cleaned_payload = _strip_obsolete_config_keys(migrated_payload)

    try:
        config = StoredConfig.model_validate(cleaned_payload)
    except ValidationError as exc:
        raise StorageError(f"Invalid data in {path}") from exc

    if cleaned_payload != payload:
        atomic_write_json(path, config.model_dump(mode="json", exclude_none=True))

    return config


def save_config(data_root: Path | None, config: StoredConfig) -> None:
    root = ensure_storage_root(data_root)
    atomic_write_json(
        root / CONFIG_FILE_NAME,
        config.model_dump(mode="json", exclude_none=True),
    )


def _load_json_payload(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise StorageError(f"Invalid JSON in {path}") from exc
    except UnicodeDecodeError as exc:
        raise StorageError(f"Could not read {path}") from exc
    except OSError as exc:
        raise StorageError(f"Could not read {path}") from exc


def _migrate_config_payload(payload: Any, default_config: StoredConfig) -> Any:
    if not isinstance(payload, dict) or payload.get("version") != 1:
        return payload

    legacy_gemini = payload.get("gemini")
    text_model = default_config.gemini.text_model
    analysis_model = default_config.gemini.analysis_model
    if isinstance(legacy_gemini, dict):
        legacy_model = legacy_gemini.get("model")
        if legacy_model:
            text_model = legacy_model
            analysis_model = legacy_model

    migrated_payload = dict(payload)
    migrated_payload["version"] = 2
    migrated_payload["gemini"] = {
        "text_model": text_model,
        "analysis_model": analysis_model,
        "same_model_for_analysis": True,
        "text_thinking_level": "high",
    }
    return migrated_payload


_OBSOLETE_CONFIG_KEYS: frozenset[str] = frozenset({"last_topic_prompt"})


def _strip_obsolete_config_keys(payload: Any) -> Any:
    if not isinstance(payload, dict):
        return payload
    if not _OBSOLETE_CONFIG_KEYS.intersection(payload):
        return payload
    return {key: value for key, value in payload.items() if key not in _OBSOLETE_CONFIG_KEYS}


def load_secrets(data_root: Path | None = None) -> StoredSecrets:
    root = ensure_storage_root(data_root)
    return _load_model(root / SECRETS_FILE_NAME, StoredSecrets, StoredSecrets())


def save_secrets(data_root: Path | None, secrets: StoredSecrets) -> None:
    root = ensure_storage_root(data_root)
    atomic_write_json(
        root / SECRETS_FILE_NAME,
        secrets.model_dump(mode="json", exclude_none=True),
    )


def load_history(data_root: Path | None = None) -> HistoryStore:
    root = ensure_storage_root(data_root)
    return _load_model(root / HISTORY_FILE_NAME, HistoryStore, HistoryStore())


def save_history(data_root: Path | None, history: HistoryStore) -> None:
    root = ensure_storage_root(data_root)
    atomic_write_json(
        root / HISTORY_FILE_NAME,
        history.model_dump(mode="json", exclude_none=True),
    )
