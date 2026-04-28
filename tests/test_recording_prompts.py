from sayclearly.recording.prompts import (
    build_audio_analysis_prompt,
    build_audio_analysis_system_instruction,
)


def test_build_audio_analysis_prompt_includes_all_context() -> None:
    prompt = build_audio_analysis_prompt(
        language="Ukrainian",
        analysis_language="English",
        exercise_text="The quick brown fox.",
    )

    assert "Ukrainian" in prompt
    assert "English" in prompt
    assert "The quick brown fox." in prompt
    assert "clarity_score" in prompt
    assert "clarity_comment" in prompt
    assert "pace_score" in prompt
    assert "pace_comment" in prompt
    assert "recommendations" in prompt


def test_build_audio_analysis_prompt_defines_hesitations_and_excludes_leading_silence() -> None:
    prompt = build_audio_analysis_prompt(
        language="Ukrainian",
        analysis_language="Ukrainian",
        exercise_text="Sample.",
    )

    assert "before the first word" in prompt
    assert "after the last word" in prompt
    assert "INSIDE a sentence" in prompt or "inside a sentence" in prompt.lower()


def test_build_audio_analysis_prompt_demands_grounding_in_exercise_text() -> None:
    prompt = build_audio_analysis_prompt(
        language="Ukrainian",
        analysis_language="Ukrainian",
        exercise_text="Sample.",
    )

    assert "content fidelity" in prompt
    assert "preserved" in prompt or "omitted" in prompt or "distorted" in prompt


def test_build_audio_analysis_system_instruction_requires_localized_output() -> None:
    instruction = build_audio_analysis_system_instruction(analysis_language="Ukrainian")

    assert "JSON" in instruction
    assert "Ukrainian" in instruction
    assert "MUST be written in Ukrainian" in instruction
