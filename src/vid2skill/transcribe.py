"""Local speech-to-text via faster-whisper, for platforms without native captions.

Runs fully on-device (CPU, int8) - no API key, no per-request cost. Model weights
are downloaded once from Hugging Face on first use and cached locally after that.
"""

from pathlib import Path
from typing import Callable

_model_cache: dict[str, object] = {}


def transcribe_audio(
    path: Path,
    *,
    model_size: str = "base",
    on_phase: Callable[[str], None] | None = None,
) -> str:
    from faster_whisper import WhisperModel

    model = _model_cache.get(model_size)
    if model is None:
        # First run downloads model weights from Hugging Face and caches them
        # locally, which can take a while - worth its own phase so the CLI
        # doesn't look stuck waiting on the network.
        if on_phase:
            on_phase("load_whisper_model")
        model = WhisperModel(model_size, device="cpu", compute_type="int8")
        _model_cache[model_size] = model

    if on_phase:
        on_phase("transcribe_audio")
    segments, _ = model.transcribe(str(path))
    return " ".join(segment.text.strip() for segment in segments).strip()
