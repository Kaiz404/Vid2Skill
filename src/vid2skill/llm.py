import json
import shutil
import subprocess
from dataclasses import dataclass


class ClaudeCLINotFoundError(RuntimeError):
    """Raised when the `claude` CLI cannot be found or launched."""


class ClaudeCLIError(RuntimeError):
    """Raised when the `claude` CLI runs but fails, times out, or returns bad output."""


@dataclass
class ClaudeResult:
    text: str
    cost_usd: float | None
    session_id: str | None


def run_claude(instruction: str, stdin_content: str, *, timeout: int = 300) -> ClaudeResult:
    """Run `claude -p <instruction>` with `stdin_content` piped on stdin.

    Instruction goes in argv (kept short and fixed); the (potentially large)
    transcript goes over stdin, so this never hits Windows argv length limits.
    """
    claude_path = shutil.which("claude")
    if claude_path is None:
        raise ClaudeCLINotFoundError(
            "`claude` CLI not found on PATH. Install Claude Code and log in."
        )

    cmd = [claude_path, "-p", instruction, "--output-format", "json", "--no-session-persistence"]

    try:
        proc = subprocess.run(
            cmd,
            input=stdin_content,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
        )
    except (FileNotFoundError, OSError) as e:
        raise ClaudeCLINotFoundError(f"Failed to launch claude CLI: {e}") from e
    except subprocess.TimeoutExpired as e:
        raise ClaudeCLIError(f"claude CLI timed out after {timeout}s") from e

    if proc.returncode != 0:
        raise ClaudeCLIError(f"claude exited {proc.returncode}: {proc.stderr.strip()[:2000]}")

    if not proc.stdout.strip():
        raise ClaudeCLIError("claude CLI returned empty stdout")

    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError as e:
        raise ClaudeCLIError(f"claude CLI returned invalid JSON: {e}") from e

    result_text = (payload.get("result") or "").strip()
    if payload.get("is_error") or not result_text:
        raise ClaudeCLIError(f"claude reported an error or empty result: {payload.get('result')!r}")

    return ClaudeResult(
        text=result_text,
        cost_usd=payload.get("total_cost_usd"),
        session_id=payload.get("session_id"),
    )
