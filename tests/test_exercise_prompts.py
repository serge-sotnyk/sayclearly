from sayclearly.exercise.prompts import build_exercise_generation_prompt


def test_build_exercise_generation_prompt_includes_topic_and_recent_texts() -> None:
    prompt = build_exercise_generation_prompt(
        language="en",
        topic_prompt="Order coffee before work",
        recent_texts=[
            "A recent reading about breathing calmly.",
            "Another recent reading about clear consonants.",
        ],
    )

    assert "Language: en" in prompt
    assert "Order coffee before work" in prompt
    assert "Recent texts to avoid closely repeating" in prompt
    assert "breathing calmly" in prompt
    assert "clear consonants" in prompt
    assert "Return JSON only" in prompt


def test_build_exercise_generation_prompt_handles_empty_topic_and_history() -> None:
    prompt = build_exercise_generation_prompt(
        language="uk",
        topic_prompt="",
        recent_texts=[],
    )

    assert "Language: uk" in prompt
    assert "No explicit topic was provided" in prompt
    assert "No recent texts are available" in prompt
