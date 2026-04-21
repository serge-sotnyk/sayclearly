from pathlib import Path

from fastapi import APIRouter, HTTPException

from sayclearly.history_service import HistoryService, HistorySessionNotFoundError
from sayclearly.storage import StorageError
from sayclearly.storage_models import HistorySession, HistoryStore


def build_history_router(data_root: Path | None = None) -> APIRouter:
    service = HistoryService(data_root)
    router = APIRouter()

    @router.get("/api/history", response_model=HistoryStore)
    def get_history() -> HistoryStore:
        try:
            return service.list_history()
        except StorageError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @router.get("/api/history/{session_id}", response_model=HistorySession)
    def get_history_session(session_id: str) -> HistorySession:
        try:
            return service.get_session(session_id)
        except HistorySessionNotFoundError as exc:
            raise HTTPException(
                status_code=404,
                detail=f"History session not found: {exc}",
            ) from exc
        except StorageError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @router.post("/api/history", response_model=HistoryStore)
    def save_history_session(session: HistorySession) -> HistoryStore:
        try:
            return service.save_session(session)
        except StorageError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    return router
