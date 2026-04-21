from pathlib import Path

from fastapi import APIRouter, HTTPException

from sayclearly.config.models import ConfigUpdatePayload, PublicConfigView
from sayclearly.config.service import ConfigService
from sayclearly.storage.files import StorageError


def build_config_router(data_root: Path | None = None) -> APIRouter:
    service = ConfigService(data_root)
    router = APIRouter()

    @router.get("/api/config", response_model=PublicConfigView)
    def get_config() -> PublicConfigView:
        try:
            return service.get_public_config()
        except StorageError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @router.post("/api/config", response_model=PublicConfigView)
    def update_config(payload: ConfigUpdatePayload) -> PublicConfigView:
        try:
            return service.update_config(payload)
        except StorageError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @router.delete("/api/config/api-key", response_model=PublicConfigView)
    def clear_api_key() -> PublicConfigView:
        try:
            return service.clear_stored_gemini_api_key()
        except StorageError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    return router
