import json
import os
import tempfile
from pathlib import Path

from pydantic import BaseModel, ValidationError

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

    _ensure_default_file(root / CONFIG_FILE_NAME, StoredConfig())
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
            json.dump(data, handle, ensure_ascii=True, indent=2)
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
    return _load_model(root / CONFIG_FILE_NAME, StoredConfig, StoredConfig())


def save_config(data_root: Path | None, config: StoredConfig) -> None:
    root = ensure_storage_root(data_root)
    atomic_write_json(
        root / CONFIG_FILE_NAME,
        config.model_dump(mode="json", exclude_none=True),
    )


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
