"""Terminal presentation: spinner with cycling flavor text, styled messages.

Kept separate from pipeline.py so the pipeline stays UI-agnostic and testable.
"""

import random
import threading
import time

from rich.console import Console

console = Console()
err_console = Console(stderr=True)

TICK_SECONDS = 2.5

PHASE_FLAVORS: dict[str, list[str]] = {
    "extract": ["Getting started", "Figuring out where this came from"],
    "fetch_captions": ["Fetching captions", "Wrangling captions", "Talking to YouTube"],
    "download_audio": ["Downloading audio", "Grabbing the Reel", "Talking to Instagram"],
    "load_whisper_model": ["Loading transcription model", "Warming up Whisper (first run only)"],
    "transcribe_audio": ["Transcribing audio", "Listening closely", "Turning speech into text"],
    "generate_skill": ["Cooking skill", "Simmering skill", "Distilling knowledge"],
    "generate_summary": ["Summarizing", "Condensing", "Boiling it down"],
    "retry": ["Redoing that", "Taking another pass"],
    "write": ["Plating", "Saving files"],
}


class Spinner:
    """Animated status line that cycles whimsical text per pipeline phase."""

    def __init__(self, mode: str):
        self._mode = mode
        self._phase = "extract"
        self._start = time.monotonic()
        self._stop = threading.Event()
        self._status = console.status(self._render(), spinner="dots")
        self._thread = threading.Thread(target=self._run, daemon=True)

    def _pool_key(self, phase: str) -> str:
        if phase == "generate":
            return "generate_skill" if self._mode == "skill" else "generate_summary"
        return phase

    def _render(self) -> str:
        elapsed = int(time.monotonic() - self._start)
        pool = PHASE_FLAVORS.get(self._pool_key(self._phase), [self._phase])
        return f"[bold cyan]{random.choice(pool)}…[/bold cyan] ({elapsed}s)"

    def _run(self) -> None:
        while not self._stop.wait(TICK_SECONDS):
            self._status.update(self._render())

    def update_phase(self, phase: str) -> None:
        self._phase = phase
        self._status.update(self._render())

    @property
    def elapsed(self) -> float:
        return time.monotonic() - self._start

    def __enter__(self) -> "Spinner":
        self._status.__enter__()
        self._thread.start()
        return self

    def __exit__(self, *exc_info: object) -> None:
        self._stop.set()
        self._thread.join(timeout=0.1)
        self._status.__exit__(*exc_info)


def success(message: str) -> None:
    console.print(f"[bold green]✔[/bold green] {message}")


def error(message: str) -> None:
    err_console.print(f"[bold red]✖[/bold red] {message}")
