"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { AlertIcon, ClockIcon, LinkIcon } from "./icons";
import { RecentSessions } from "./recent-sessions";
import { ThemeToggle } from "./theme-toggle";
import { VideoPreview } from "./video-preview";
import { addSession, type Segment } from "../lib/session";
import { tryExtractVideoId } from "../lib/youtube";

/** Smoothly cross-fades the card between view states where the browser supports it. */
function withViewTransition(update: () => void): void {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> };
  };
  if (doc.startViewTransition) {
    // A transition can be aborted (e.g. superseded by another, or the tab was hidden);
    // that rejection is expected and not worth surfacing as an unhandled promise error.
    doc.startViewTransition(() => flushSync(update)).finished.catch(() => {});
  } else {
    update();
  }
}

type Mode = "skill" | "summary";
type View = "idle" | "progress" | "error" | "busy";

interface JobSnapshot {
  status: "queued" | "running" | "done" | "error";
  phase?: string;
  mode: Mode;
  title?: string;
  slug?: string;
  content?: string;
  videoId?: string;
  segments?: Segment[];
  errorHeading?: string;
  errorMessage?: string;
}

const BUSY_MESSAGE = "2 of 2 generation slots are busy right now — try again in a minute or two.";
const GENERIC_ERROR = "Something went wrong. Please try again.";

const PHASE_TIPS: Record<string, string[]> = {
  extract: ["Resolving the video…", "Reading the URL…"],
  fetch_captions: ["Talking to YouTube…", "Pulling the transcript…", "Grabbing captions…"],
  generate: [
    "Reading through the transcript…",
    "Picking out the key ideas…",
    "Structuring the write-up…",
    "Distilling knowledge…",
  ],
  retry: ["Taking another pass…", "Re-checking the output format…"],
  write: ["Finalizing formatting…", "Wrapping things up…"],
};

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

/** Cycles through a phase's rotating status lines so a long wait still feels alive. */
function useRotatingTip(phase: string | undefined): string {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
    const tips = PHASE_TIPS[phase ?? ""];
    if (!tips || tips.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % tips.length), 2200);
    return () => clearInterval(timer);
  }, [phase]);

  const tips = PHASE_TIPS[phase ?? ""];
  return tips?.[index] ?? "Working on it…";
}

export default function Page() {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<Mode>("skill");
  const [view, setView] = useState<View>("idle");
  const [phase, setPhase] = useState<string | undefined>();
  const [elapsed, setElapsed] = useState(0);
  const [errorHeading, setErrorHeading] = useState<string | undefined>();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const router = useRouter();
  const jobIdRef = useRef<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const videoId = useMemo(() => tryExtractVideoId(url), [url]);
  const rotatingTip = useRotatingTip(phase);

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
      if (snap.status === "done") {
        cleanupStream();
        const id = jobIdRef.current;
        if (!id || !snap.videoId) {
          withViewTransition(() => {
            setErrorHeading("Something went wrong");
            setErrorMessage(GENERIC_ERROR);
            setView("error");
          });
          return;
        }
        const versionId = crypto.randomUUID();
        void addSession({
          id,
          videoId: snap.videoId,
          title: snap.title || "Your video",
          mode: snap.mode,
          slug: snap.slug || id,
          createdAt: Date.now(),
          segments: snap.segments ?? [],
          versions: [{ id: versionId, content: snap.content ?? "", createdAt: Date.now() }],
          activeVersionId: versionId,
          messages: [],
        }).then(() => router.push(`/s/${id}`));
      } else if (snap.status === "error") {
        withViewTransition(() => {
          setErrorHeading(snap.errorHeading || "Something went wrong");
          setErrorMessage(snap.errorMessage || GENERIC_ERROR);
          setView("error");
        });
        cleanupStream();
      } else if (snap.phase) {
        setPhase(snap.phase);
      }
    },
    [cleanupStream, router],
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

    withViewTransition(() => {
      setErrorHeading(undefined);
      setErrorMessage(undefined);
      setPhase("extract");
      setElapsed(0);
      setView("progress");
    });

    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), mode }),
      });

      if (res.status === 429) {
        withViewTransition(() => setView("busy"));
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        withViewTransition(() => {
          setErrorHeading(body.error === "invalid_url" ? "That doesn't look like a YouTube link" : "Something went wrong");
          setErrorMessage(body.message || GENERIC_ERROR);
          setView("error");
        });
        return;
      }

      const { id } = (await res.json()) as { id: string };
      jobIdRef.current = id;
      startStream(id);
    } catch {
      withViewTransition(() => {
        setErrorHeading("Something went wrong");
        setErrorMessage(GENERIC_ERROR);
        setView("error");
      });
    }
  }

  const showForm = view === "idle" || view === "error" || view === "busy";
  const fetchStatus = stepStatus(phase, "fetch");
  const generateStatus = stepStatus(phase, "generate");

  return (
    <>
      <div className="page-head">
        <h1>vid2skill</h1>
        <ThemeToggle />
      </div>

      <div className="card">
        {view === "progress" && (
          <>
            <h2>{mode === "skill" ? "Generating your skill" : "Generating your summary"}</h2>
            <p className="sub">This usually takes under a minute.</p>
            {videoId && <VideoPreview videoId={videoId} size="large" />}
            <div className="shimmer-bar" />
            <div className="stepper">
              <div className={`step ${fetchStatus === "done" ? "done" : ""}`}>
                <div className={`step-dot ${fetchStatus}`}>{fetchStatus === "done" ? "✓" : "1"}</div>
                <div>
                  <div className="step-label">Fetching transcript</div>
                  {fetchStatus === "active" && <div className="step-sub">{rotatingTip}</div>}
                </div>
              </div>
              <div className={`step ${generateStatus === "done" ? "done" : ""}`}>
                <div className={`step-dot ${generateStatus}`}>{generateStatus === "done" ? "✓" : "2"}</div>
                <div>
                  <div className="step-label">Generating with AI</div>
                  {generateStatus === "active" && (
                    <>
                      <div className="step-sub">{rotatingTip}</div>
                      {phase === "retry" && <div className="step-note">auto-retries once if the model returns malformed output</div>}
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="elapsed">
              {elapsed}s elapsed
              {elapsed > 25 && <span className="elapsed-note"> — some videos take a little longer, hang tight.</span>}
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

            {videoId && (
              <div className="url-preview">
                <VideoPreview videoId={videoId} size="compact" />
                <span className="url-preview-text">Looks like a valid YouTube link</span>
              </div>
            )}

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

      {showForm && <RecentSessions />}

      <p className="footer-note">No sign-up. History stays on this device. Runs against a shared rate limit.</p>
    </>
  );
}
