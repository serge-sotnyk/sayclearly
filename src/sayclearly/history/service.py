from pathlib import Path
from threading import Lock

from pydantic import BaseModel, ConfigDict

from sayclearly.storage.files import load_config, load_history, save_history
from sayclearly.storage.models import HistorySession, HistoryStore

_SAVE_SESSION_LOCK = Lock()


class HistorySessionNotFoundError(LookupError):
    """Raised when a requested session id is not present in history."""


class RecentTopicEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    topic: str
    text_language: str
    analysis_language: str


class HistoryService:
    def __init__(self, data_root: Path | None = None) -> None:
        self.data_root = data_root

    def list_history(self) -> HistoryStore:
        return load_history(self.data_root)

    def get_session(self, session_id: str) -> HistorySession:
        history = load_history(self.data_root)
        for session in history.sessions:
            if session.id == session_id:
                return session
        raise HistorySessionNotFoundError(session_id)

    def save_session(self, session: HistorySession) -> HistoryStore:
        with _SAVE_SESSION_LOCK:
            history = load_history(self.data_root)
            config = load_config(self.data_root)

            remaining_sessions = [
                existing for existing in history.sessions if existing.id != session.id
            ]
            remaining_sessions.insert(0, session)
            history.sessions = remaining_sessions[: config.session_limit]

            save_history(self.data_root, history)
            return history

    def recent_topic_entries(self, limit: int | None = None) -> list[RecentTopicEntry]:
        if limit is not None and limit <= 0:
            return []

        history = load_history(self.data_root)
        entries: list[RecentTopicEntry] = []
        seen_keys: set[str] = set()

        for session in history.sessions:
            topic = (session.topic_prompt or "").strip()
            if not topic:
                continue
            key = topic.casefold()
            if key in seen_keys:
                continue
            seen_keys.add(key)
            entries.append(
                RecentTopicEntry(
                    topic=topic,
                    text_language=session.language,
                    analysis_language=session.analysis_language or session.language,
                )
            )
            if limit is not None and len(entries) >= limit:
                break

        return entries
