from sayclearly.recording.prompts import (
    build_audio_analysis_prompt,
    build_audio_analysis_system_instruction,
)


def test_build_audio_analysis_prompt_includes_all_context() -> None:
    prompt = build_audio_analysis_prompt(
        language="uk",
        analysis_language="en",
        exercise_text="The quick brown fox.",
    )

    assert "uk" in prompt
    assert "en" in prompt
    assert "The quick brown fox." in prompt
    assert "clarity_score" in prompt
    assert "pace_score" in prompt


def test_build_audio_analysis_system_instruction_requires_json() -> None:
    instruction = build_audio_analysis_system_instruction()

    assert "JSON" in instruction
    assert "gentle" in instruction.lower() or "clarity" in instruction.lower()
