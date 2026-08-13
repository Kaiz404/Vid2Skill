"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertIcon, ClockIcon, CopyIcon, DownloadIcon, LinkIcon } from "./icons";

type Mode = "skill" | "summary";
type View = "idle" | "progress" | "result" | "error" | "busy";

interface JobSnapshot {
  status: "queued" | "running" | "done" | "error";
  phase?: string;
  mode: Mode;
  title?: string;
  slug?: string;
  content?: string;
  errorHeading?: string;
  errorMessage?: string;
}

const BUSY_MESSAGE = "2 of 2 generation slots are busy right now — try again in a minute or two.";
const GENERIC_ERROR = "Something went wrong. Please try again.";

function stepStatus(phase: string | undefined, target: "fetch" | "generate"): "pending" | "active" | "done" {
  const fetchPhases = new Set(["extract", "fetch_captions"]);
  const generatePhases = new Set(["generate", "retry"]);

  if (target === "fetch") {
    if (!phase) return "pending";
    if (fetchPhases.has(phase)) return "active";
    return "done"; // generate/retry/write all imply the fetch step already finished
  }

  if (generatePhases.has(phase ?? "")) return "active";
  if (phase === "write") return "done";
  return "pending";
}

export default function Page() {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<Mode>("skill");
  const [view, setView] = useState<View>("idle");
  const [phase, setPhase] = useState<string | undefined>();
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<{ title?: string; slug?: string; content?: string; mode: Mode } | null>(
    null,
  );
  const [errorHeading, setErrorHeading] = useState<string | undefined>();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);

  const esRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (view !== "progress") return;
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [view]);

  const cleanupStream = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => cleanupStream, [cleanupStream]);

  const applySnapshot = useCallback(
    (snap: JobSnapshot) => {
      if (snap.phase) setPhase(snap.phase);
      if (snap.status === "done") {
        setResult({ title: snap.title, slug: snap.slug, content: snap.content, mode: snap.mode });
        setView("result");
        cleanupStream();
      } else if (snap.status === "error") {
        setErrorHeading(snap.errorHeading || "Something went wrong");
        setErrorMessage(snap.errorMessage || GENERIC_ERROR);
        setView("error");
        cleanupStream();
      }
    },
    [cleanupStream],
  );

  const startPolling = useCallback(
    (id: string) => {
      pollTimerRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/jobs/${id}`);
          if (!res.ok) return;
          const snap = (await res.json()) as JobSnapshot;
          applySnapshot(snap);
        } catch {
          // transient network hiccup - next tick will retry
        }
      }, 1500);
    },
    [applySnapshot],
  );

  const startStream = useCallback(
    (id: string) => {
      if (typeof EventSource === "undefined") {
        startPolling(id);
        return;
      }

      const es = new EventSource(`/api/jobs/${id}/stream`);
      esRef.current = es;

      es.addEventListener("phase", (e) => {
        const data = JSON.parse((e as MessageEvent).data) as { phase: string };
        setPhase(data.phase);
      });
      es.addEventListener("done", (e) => {
        applySnapshot(JSON.parse((e as MessageEvent).data) as JobSnapshot);
      });
      es.addEventListener("error", (e) => {
        const raw = (e as MessageEvent).data;
        if (raw) {
          applySnapshot(JSON.parse(raw) as JobSnapshot);
        }
      });
      es.onerror = () => {
        cleanupStream();
        startPolling(id);
      };
    },
    [applySnapshot, cleanupStream, startPolling],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (view === "progress" || view === "busy") return;
    if (!url.trim()) return;

    setErrorHeading(undefined);
    setErrorMessage(undefined);
    setPhase("extract");
    setElapsed(0);
    setView("progress");

    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), mode }),
      });

      if (res.status === 429) {
        setView("busy");
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        setErrorHeading(body.error === "invalid_url" ? "That doesn't look like a YouTube link" : "Something went wrong");
        setErrorMessage(body.message || GENERIC_ERROR);
        setView("error");
        return;
      }

      const { id } = (await res.json()) as { id: string };
      startStream(id);
    } catch {
      setErrorHeading("Something went wrong");
      setErrorMessage(GENERIC_ERROR);
      setView("error");
    }
  }

  function startNew() {
    cleanupStream();
    setView("idle");
    setResult(null);
    setErrorHeading(undefined);
    setErrorMessage(undefined);
    setPhase(undefined);
    setUrl("");
  }

  async function copyContent() {
    if (!result?.content) return;
    await navigator.clipboard.writeText(result.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function downloadContent() {
    if (!result?.content) return;
    const filename = result.mode === "skill" ? `${result.slug}.SKILL.md` : `${result.slug}.md`;
    const blob = new Blob([result.content], { type: "text/markdown" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  const showForm = view === "idle" || view === "error" || view === "busy";
  const fetchStatus = stepStatus(phase, "fetch");
  const generateStatus = stepStatus(phase, "generate");

  return (
    <>
      <div className="page-head">
        <h1>vid2skill</h1>
      </div>

      <div className="card">
        {view === "progress" && (
          <>
            <h2>{mode === "skill" ? "Generating your skill" : "Generating your summary"}</h2>
            <p className="sub">This usually takes under a minute.</p>
            <div className="shimmer-bar" />
            <div className="stepper">
              <div className={`step ${fetchStatus === "done" ? "done" : ""}`}>
                <div className={`step-dot ${fetchStatus}`}>{fetchStatus === "done" ? "✓" : "1"}</div>
                <div>
                  <div className="step-label">Fetching transcript</div>
                  <div className="step-sub">Talking to YouTube…</div>
                </div>
              </div>
              <div className={`step ${generateStatus === "done" ? "done" : ""}`}>
                <div className={`step-dot ${generateStatus}`}>{generateStatus === "done" ? "✓" : "2"}</div>
                <div>
                  <div className="step-label">Generating with AI</div>
                  {generateStatus === "active" && (
                    <>
                      <div className="step-sub">{phase === "retry" ? "Taking another pass…" : "Distilling knowledge…"}</div>
                      <div className="step-note">auto-retries once if the model returns malformed output</div>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="elapsed">{elapsed}s elapsed</div>
          </>
        )}

        {view === "result" && result && (
          <>
            <div className="meta">
              <span className="title">{result.title || "Your video"}</span>
            </div>
            <span className="badge">{result.mode}</span>
            <div className="content-box">{result.content}</div>
            <div className="actions">
              <button className="primary-a" onClick={copyContent}>
                <CopyIcon />
                {copied ? "Copied!" : "Copy"}
              </button>
              <button className="ghost" onClick={downloadContent}>
                <DownloadIcon />
                Download .md
              </button>
              <button className="ghost" onClick={startNew}>
                Start a new one
              </button>
            </div>
          </>
        )}

        {showForm && (
          <form onSubmit={handleSubmit}>
            <h2>Turn a YouTube video into a Claude Skill</h2>
            <p className="sub">Paste a link — we&apos;ll pull the transcript and write it for you.</p>

            {view === "error" && (
              <div className="banner err">
                <AlertIcon />
                <div>
                  <strong>{errorHeading || "Something went wrong"}</strong>
                  {errorMessage || "Please try again."}
                </div>
              </div>
            )}

            {view === "busy" && (
              <div className="banner warn">
                <ClockIcon />
                <div>
                  <strong>Running at capacity</strong>
                  {BUSY_MESSAGE}
                </div>
              </div>
            )}

            <div className="input-row">
              <LinkIcon />
              <input
                type="text"
                placeholder="https://youtube.com/watch?v=…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={view === "busy"}
              />
            </div>

            <div className={`toggle ${mode === "summary" ? "mode-second" : ""}`}>
              <div className="toggle-thumb" />
              <button type="button" className={mode === "skill" ? "active" : ""} onClick={() => setMode("skill")}>
                Skill
              </button>
              <button type="button" className={mode === "summary" ? "active" : ""} onClick={() => setMode("summary")}>
                Summary
              </button>
            </div>

            <button className="primary" type="submit" disabled={view === "busy"}>
              {view === "error" ? "Try again" : "Generate"}
            </button>
          </form>
        )}
      </div>

      <p className="footer-note">No sign-up. No history kept. Runs against a shared rate limit.</p>
    </>
  );
}
