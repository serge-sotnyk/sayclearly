import threading
import time
from pathlib import Path

import pytest

from sayclearly.history.service import HistoryService, HistorySessionNotFoundError
from sayclearly.storage.files import load_config, load_history, save_config
from sayclearly.storage.models import HistorySession, SessionAnalysis


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

    from sayclearly.storage.files import save_history as original_save_history

    def delayed_save_history(data_root: Path | None, history: object) -> None:
        nonlocal save_call_count
        save_call_count += 1
        if save_call_count == 1:
            first_save_started.set()
            time.sleep(0.2)
        original_save_history(data_root, history)

    monkeypatch.setattr(
        "sayclearly.history.service.save_history",
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


def _topic_session(
    session_id: str,
    *,
    topic: str | None,
    language: str = "Ukrainian",
    analysis_language: str | None = "Ukrainian",
    second: int = 0,
) -> HistorySession:
    return HistorySession(
        id=session_id,
        created_at=f"2026-04-20T10:00:{second:02d}",
        language=language,
        analysis_language=analysis_language,
        topic_prompt=topic,
        text=f"Text for {session_id}",
        analysis=SessionAnalysis(clarity_score=80, pace_score=70, summary=["ok"]),
    )


def test_recent_topic_entries_returns_unique_topics_newest_first(tmp_path: Path) -> None:
    service = HistoryService(tmp_path)
    service.save_session(_topic_session("01", topic="rust facts", second=1))
    service.save_session(
        _topic_session("02", topic="ordering coffee", language="English", second=2)
    )
    service.save_session(_topic_session("03", topic="RUST FACTS", second=3))

    entries = service.recent_topic_entries()

    assert [entry.topic for entry in entries] == ["RUST FACTS", "ordering coffee"]
    assert entries[0].text_language == "Ukrainian"
    assert entries[1].text_language == "English"


def test_recent_topic_entries_excludes_empty_topics(tmp_path: Path) -> None:
    service = HistoryService(tmp_path)
    service.save_session(_topic_session("01", topic="real topic", second=1))
    service.save_session(_topic_session("02", topic=None, second=2))
    service.save_session(_topic_session("03", topic="   ", second=3))

    entries = service.recent_topic_entries()

    assert [entry.topic for entry in entries] == ["real topic"]


def test_recent_topic_entries_falls_back_for_legacy_analysis_language(tmp_path: Path) -> None:
    service = HistoryService(tmp_path)
    service.save_session(
        _topic_session(
            "01",
            topic="legacy topic",
            language="Ukrainian",
            analysis_language=None,
            second=1,
        )
    )

    entries = service.recent_topic_entries()

    assert entries[0].analysis_language == "Ukrainian"


def test_recent_topic_entries_caps_at_limit(tmp_path: Path) -> None:
    service = HistoryService(tmp_path)
    for index in range(5):
        service.save_session(_topic_session(f"{index:02}", topic=f"topic {index}", second=index))

    entries = service.recent_topic_entries(limit=3)

    assert len(entries) == 3
    assert entries[0].topic == "topic 4"


def test_recent_topic_entries_returns_empty_for_zero_or_negative_limit(tmp_path: Path) -> None:
    service = HistoryService(tmp_path)
    service.save_session(_topic_session("01", topic="any", second=1))

    assert service.recent_topic_entries(limit=0) == []
    assert service.recent_topic_entries(limit=-1) == []
