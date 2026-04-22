import pytest

from sayclearly.gemini.telemetry import GeminiTelemetry


class FakeObservation:
    def __init__(self) -> None:
        self.updates: list[dict[str, object]] = []
        self.end_calls = 0

    def update(self, **kwargs: object) -> None:
        self.updates.append(kwargs)

    def end(self) -> None:
        self.end_calls += 1


class FakeLangfuse:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []
        self.observation = FakeObservation()

    def start_observation(self, **kwargs: object) -> FakeObservation:
        self.calls.append(kwargs)
        return self.observation


def test_start_text_generation_is_noop_when_langfuse_env_vars_are_absent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("LANGFUSE_PUBLIC_KEY", raising=False)
    monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)
    monkeypatch.delenv("LANGFUSE_HOST", raising=False)
    factory_calls: list[dict[str, object]] = []

    def fake_factory(**kwargs: object) -> FakeLangfuse:
        factory_calls.append(kwargs)
        return FakeLangfuse()

    telemetry = GeminiTelemetry(langfuse_factory=fake_factory)

    trace = telemetry.start_text_generation(
        prompt="Generate a short exercise.",
        model="gemini-2.5-flash",
        thinking_level="medium",
    )

    trace.record_success("Speak slowly.")

    assert factory_calls == []


def test_start_text_generation_records_success_with_langfuse_when_enabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "public-key")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "secret-key")
    monkeypatch.setenv("LANGFUSE_HOST", "https://langfuse.example")
    fake_langfuse = FakeLangfuse()

    telemetry = GeminiTelemetry(langfuse_factory=lambda **_: fake_langfuse)

    trace = telemetry.start_text_generation(
        prompt="Generate a short exercise.",
        model="gemini-2.5-flash",
        thinking_level="high",
    )
    trace.record_success("Speak slowly.")

    assert fake_langfuse.calls == [
        {
            "name": "gemini.generate_exercise",
            "as_type": "generation",
            "input": "Generate a short exercise.",
            "model": "gemini-2.5-flash",
            "model_parameters": {"thinking_level": "high"},
        }
    ]
    assert fake_langfuse.observation.updates == [{"output": "Speak slowly."}]
    assert fake_langfuse.observation.end_calls == 1
