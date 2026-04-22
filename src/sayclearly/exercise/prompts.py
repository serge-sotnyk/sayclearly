def build_exercise_generation_prompt(
    *,
    language: str,
    topic_prompt: str,
    recent_texts: list[str],
) -> str:
    topic_section = (
        f"Topic preference: {topic_prompt}."
        if topic_prompt
        else (
            "No explicit topic was provided. Pick an interesting everyday topic "
            "suitable for reading aloud."
        )
    )
    if recent_texts:
        recent_text_lines = "\n".join(f"- {text}" for text in recent_texts)
        recent_texts_section = f"Recent texts to avoid closely repeating:\n{recent_text_lines}"
    else:
        recent_texts_section = "No recent texts are available."

    return "\n".join(
        [
            "Generate a short reading exercise for diction practice.",
            f"Language: {language}",
            topic_section,
            "Aim for 5-8 sentences that are interesting, easy to read aloud, and easy to retell.",
            "Vary sentence rhythm and keep the passage calm and natural.",
            recent_texts_section,
            'Return JSON only with the shape {"text": "..."}.',
            "Do not add markdown fences or extra commentary.",
        ]
    )
