def build_audio_analysis_system_instruction() -> str:
    return (
        "You are a diction and speech clarity coach. "
        "Analyze the provided audio recording of a spoken retelling. "
        "Focus on: speech clarity and articulation, speaking pace and rhythm, "
        "hesitations, pauses, and restarts, blurred or swallowed word endings, "
        "speeding up or loss of control near the end. "
        "Provide gentle, practical feedback. "
        "Avoid harsh evaluative wording such as 'bad,' 'poor,' or numeric scores like '4/10.' "
        "Return JSON only. Do not add markdown fences or extra commentary."
    )


def build_audio_analysis_prompt(
    *,
    language: str,
    analysis_language: str,
    exercise_text: str,
) -> str:
    return (
        f"The speaker retold the following exercise text.\n\n"
        f"Language spoken: {language}\n"
        f"Feedback language: {analysis_language}\n\n"
        f"Exercise text:\n{exercise_text}\n\n"
        "Analyze the audio and return a JSON object with:\n"
        "- clarity_score: integer 0-100\n"
        "- pace_score: integer 0-100\n"
        "- hesitations: array of objects with "
        "{start: number (seconds), end: number (seconds), note: string}\n"
        "- summary: array of short, gentle observations\n"
        "- recommendations: array of 2-4 practical, encouraging suggestions"
    )
