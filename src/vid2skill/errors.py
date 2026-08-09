class SkillGenerationFailedError(RuntimeError):
    """Raised when the LLM produces malformed skill output twice in a row."""
