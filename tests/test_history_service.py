import threading
import time
from pathlib import Path

import pytest

from sayclearly.history_service import HistoryService, HistorySessionNotFoundError
from sayclearly.storage import load_config, load_history, save_config
from sayclearly.storage_models import HistorySession, SessionAnalysis


def make_session(session_id: str) -> HistorySession:
    return HistorySession(
        id=session_id,
        created_at=f"2026-04-20T10:00:{session_id.zfill(2)}",
        language="uk",
        topic_prompt="interesting facts",
        text=f"Generated text {session_id}",
        analysis=SessionAnalysis(
            clarity_score=7,
            pace_score=6,
            summary=[f"Summary {session_id}"],
        ),
    )


def test_save_session_keeps_newest_entry_first(tmp_path: Path) -> None:
    service = HistoryService(tmp_path)
    service.save_session(make_session("01"))

    history = service.save_session(make_session("02"))
    reloaded_history = load_history(tmp_path)

    assert [session.id for session in history.sessions] == ["02", "01"]
    assert [session.id for session in reloaded_history.sessions] == ["02", "01"]


def test_save_session_replaces_existing_entry_and_keeps_it_first(tmp_path: Path) -> None:
    service = HistoryService(tmp_path)
    service.save_session(make_session("01"))
    service.save_session(make_session("02"))

    updated_session = make_session("01").model_copy(
        update={
            "text": "Updated generated text 01",
            "analysis": SessionAnalysis(
                clarity_score=9,
                pace_score=8,
                summary=["Updated summary 01"],
            ),
        }
    )

    history = service.save_session(updated_session)
    reloaded_history = load_history(tmp_path)

    assert [session.id for session in history.sessions] == ["01", "02"]
    assert len(history.sessions) == 2
    assert history.sessions[0].text == "Updated generated text 01"
    assert [session.id for session in reloaded_history.sessions] == ["01", "02"]
    assert len(reloaded_history.sessions) == 2
    assert reloaded_history.sessions[0].text == "Updated generated text 01"


def test_save_session_trims_to_configured_limit(tmp_path: Path) -> None:
    config = load_config(tmp_path)
    save_config(tmp_path, config.model_copy(update={"session_limit": 1}))
    service = HistoryService(tmp_path)

    service.save_session(make_session("01"))
    history = service.save_session(make_session("02"))
    reloaded_history = load_history(tmp_path)

    assert [session.id for session in history.sessions] == ["02"]
    assert reloaded_history.sessions == [make_session("02")]


def test_save_session_serializes_concurrent_writes_in_process(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    service = HistoryService(tmp_path)
    load_config(tmp_path)
    load_history(tmp_path)
    first_save_started = threading.Event()
    save_call_count = 0

    from sayclearly.storage import save_history as original_save_history

    def delayed_save_history(data_root: Path | None, history: object) -> None:
        nonlocal save_call_count
        save_call_count += 1
        if save_call_count == 1:
            first_save_started.set()
            time.sleep(0.2)
        original_save_history(data_root, history)

    monkeypatch.setattr(
        "sayclearly.history_service.save_history",
        delayed_save_history,
    )

    errors: list[BaseException] = []

    def save(session_id: str) -> None:
        try:
            service.save_session(make_session(session_id))
        except BaseException as exc:  # pragma: no cover
            errors.append(exc)

    first = threading.Thread(target=save, args=("01",))
    second = threading.Thread(target=save, args=("02",))

    first.start()
    assert first_save_started.wait(timeout=2)
    second.start()
    first.join()
    second.join()

    reloaded_history = load_history(tmp_path)

    assert errors == []
    assert reloaded_history.sessions == [make_session("02"), make_session("01")]


def test_get_session_raises_for_missing_id(tmp_path: Path) -> None:
    service = HistoryService(tmp_path)

    with pytest.raises(HistorySessionNotFoundError, match="missing"):
        service.get_session("missing")
