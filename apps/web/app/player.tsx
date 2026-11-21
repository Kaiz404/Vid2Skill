"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import type { Marker } from "../lib/markers";
import { ChapterStrip } from "./chapter-strip";
import { ArrowUpIcon, CloseIcon, GripIcon } from "./icons";

interface YTPlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      host: string;
      videoId: string;
      playerVars: Record<string, number>;
      events: { onReady: () => void; onStateChange: (e: { data: number }) => void };
    },
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | undefined;

function loadYouTubeApi(): Promise<YTNamespace> {
  apiPromise ??= new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT!);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });
  return apiPromise;
}

type Seek = (seconds: number) => void;

interface PlayerHandle {
  player?: YTPlayer;
  ready: boolean;
  pendingSeek?: number;
}

export interface Playback {
  time: number;
  duration: number;
  playing: boolean;
}

const IDLE: Playback = { time: 0, duration: 0, playing: false };

/** Playback state lives outside React so the 4Hz time ticks re-render only the strips that read it. */
function createClock() {
  let state = IDLE;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch: Partial<Playback>) {
      state = { ...state, ...patch };
      listeners.forEach((l) => l());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

type Clock = ReturnType<typeof createClock>;

const PlayerContext = createContext<{ seek: Seek; handle: RefObject<PlayerHandle>; clock: Clock } | null>(null);

/** Null outside a workspace, so timestamp chips render as plain text there. */
export function useSeek(): Seek | null {
  return useContext(PlayerContext)?.seek ?? null;
}

const noopSubscribe = () => () => {};

export function usePlayback(): Playback {
  const clock = useContext(PlayerContext)?.clock;
  return useSyncExternalStore(clock?.subscribe ?? noopSubscribe, clock?.get ?? (() => IDLE), () => IDLE);
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const handle = useRef<PlayerHandle>({ ready: false });
  const clock = useMemo(createClock, []);

  const seek = useCallback<Seek>(
    (seconds) => {
      clock.set({ time: seconds });
      const h = handle.current;
      if (!h.ready || !h.player) {
        h.pendingSeek = seconds;
        return;
      }
      h.player.seekTo(seconds, true);
      h.player.playVideo();
    },
    [clock],
  );

  const value = useMemo(() => ({ seek, handle, clock }), [seek, clock]);
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

const YT_ENDED = 0;
const YT_PLAYING = 1;

/** How far the slot has scrolled past the top (0..1) before a started video lifts into the mini player. */
const DOCK_AT = 0.55;
const UNDOCK_AT = 0.4;

type Corner = "tl" | "tr" | "bl" | "br";
type Area = "main" | "chat";
interface Dock {
  area: Area;
  corner: Corner;
  width: number;
}

const DOCK_KEY = "vid2skill:mini-player";
const DEFAULT_DOCK: Dock = { area: "main", corner: "br", width: 380 };
const EDGE = 14;
const MIN_MINI_WIDTH = 240;
const MAX_MINI_WIDTH = 760;
/** Height of the compact chapter strip under the floating video. */
const MINI_STRIP_HEIGHT = 18;
/** Height of the mini player's own control bar, above the video so it never covers YouTube's controls. */
const MINI_BAR_HEIGHT = 32;

const AREA_SELECTOR: Record<Area, string> = { main: ".main-scroll", chat: ".chat-panel" };

function areaRect(area: Area): DOMRect | null {
  const el = document.querySelector<HTMLElement>(AREA_SELECTOR[area]);
  const rect = el?.getBoundingClientRect();
  if (!el || !rect || rect.width === 0) return null;
  // Keep the player off the column's scrollbar.
  const scrollbar = el.offsetWidth - el.clientWidth;
  return new DOMRect(rect.left, rect.top, rect.width - scrollbar, rect.height);
}

function clampWidth(width: number, rect: DOMRect): number {
  return Math.round(Math.max(MIN_MINI_WIDTH, Math.min(width, MAX_MINI_WIDTH, rect.width - EDGE * 2)));
}

function miniHeight(width: number, hasStrip: boolean): number {
  return MINI_BAR_HEIGHT + (width * 9) / 16 + (hasStrip ? MINI_STRIP_HEIGHT : 0);
}

function cornerPosition(rect: DOMRect, corner: Corner, width: number, height: number) {
  return {
    x: corner[1] === "r" ? rect.right - width - EDGE : rect.left + EDGE,
    y: corner[0] === "b" ? rect.bottom - height - EDGE : rect.top + EDGE,
  };
}

const OPPOSITE: Record<Corner, Corner> = { tl: "br", tr: "bl", bl: "tr", br: "tl" };

function loadDock(): Dock {
  try {
    const raw = JSON.parse(localStorage.getItem(DOCK_KEY) ?? "null") as Partial<Dock> | null;
    if (raw && (raw.area === "main" || raw.area === "chat") && typeof raw.width === "number" && raw.corner && raw.corner in OPPOSITE) {
      return raw as Dock;
    }
  } catch {
    // storage blocked or corrupt - use the default spot
  }
  return DEFAULT_DOCK;
}

function saveDock(dock: Dock): void {
  try {
    localStorage.setItem(DOCK_KEY, JSON.stringify(dock));
  } catch {
    // storage blocked - the spot just won't persist
  }
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Shared pointer-drag plumbing: captures the pointer and keeps the iframe from eating events mid-drag. */
function trackPointer(
  e: ReactPointerEvent<HTMLElement>,
  onMove: (ev: PointerEvent) => void,
  onEnd: (ev: PointerEvent) => void,
): void {
  e.preventDefault();
  const el = e.currentTarget;
  el.setPointerCapture(e.pointerId);
  document.body.classList.add("resizing-any");
  const end = (ev: PointerEvent) => {
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", end);
    el.removeEventListener("pointercancel", end);
    document.body.classList.remove("resizing-any");
    onEnd(ev);
  };
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}

interface VideoPlayerProps {
  videoId: string;
  /** Shown in the mini player's bar. */
  title: string;
  markers: Marker[];
  /** Used for the strip until the player reports the real duration. */
  fallbackDuration: number;
}

export function VideoPlayer({ videoId, title, markers, fallbackDuration }: VideoPlayerProps) {
  const ctx = useContext(PlayerContext);
  const handleRef = ctx?.handle;
  const clock = ctx?.clock;
  const slotRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const lastRectRef = useRef<DOMRect | null>(null);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [scrolledAway, setScrolledAway] = useState(false);
  const [dock, setDock] = useState<Dock>(DEFAULT_DOCK);
  const [free, setFree] = useState<{ x: number; y: number } | null>(null);
  const [interaction, setInteraction] = useState<"drag" | "resize" | null>(null);
  const [, relayout] = useReducer((n: number) => n + 1, 0);

  const docked = started && scrolledAway;
  const hasStrip = markers.length > 0;

  useEffect(() => setDock(loadDock()), []);

  useEffect(() => {
    if (!handleRef || !clock || !mountRef.current) return;
    const h = handleRef.current;
    // The YT API replaces the element it's given, so hand it a child React doesn't own.
    const target = document.createElement("div");
    mountRef.current.appendChild(target);
    let cancelled = false;

    void loadYouTubeApi().then((YT) => {
      if (cancelled) return;
      h.player = new YT.Player(target, {
        host: "https://www.youtube-nocookie.com",
        videoId,
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: () => {
            h.ready = true;
            clock.set({ duration: h.player?.getDuration() ?? 0 });
            if (h.pendingSeek !== undefined) {
              h.player?.seekTo(h.pendingSeek, true);
              h.player?.playVideo();
              h.pendingSeek = undefined;
            }
          },
          onStateChange: (e) => {
            const isPlaying = e.data === YT_PLAYING;
            setPlaying(isPlaying);
            clock.set({ playing: isPlaying, time: h.player?.getCurrentTime() ?? clock.get().time });
            if (isPlaying) setStarted(true);
            if (e.data === YT_ENDED) setStarted(false);
          },
        },
      });
    });

    return () => {
      cancelled = true;
      h.player?.destroy();
      h.player = undefined;
      h.ready = false;
      target.remove();
      clock.set({ time: 0, duration: 0, playing: false });
    };
  }, [handleRef, clock, videoId]);

  useEffect(() => {
    if (!playing || !handleRef || !clock) return;
    const timer = setInterval(() => {
      const p = handleRef.current.player;
      if (p && handleRef.current.ready) clock.set({ time: p.getCurrentTime() });
    }, 250);
    return () => clearInterval(timer);
  }, [playing, handleRef, clock]);

  // Scroll-linked shrink: the slot reports how far it has scrolled past the top as --past,
  // which CSS turns into scale; past a threshold a started video lifts into the mini player.
  useEffect(() => {
    const slot = slotRef.current;
    const scroller = slot?.closest(".main-scroll");
    if (!slot || !scroller) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const s = slot.getBoundingClientRect();
      const c = scroller.getBoundingClientRect();
      const past = Math.min(1, Math.max(0, (c.top - s.top) / s.height));
      slot.style.setProperty("--past", past.toFixed(3));
      if (cardRef.current) lastRectRef.current = cardRef.current.getBoundingClientRect();
      setScrolledAway((was) => (was ? past > UNDOCK_AT : past > DOCK_AT));
    };
    const onScroll = () => {
      frame ||= requestAnimationFrame(update);
    };
    update();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Corner positions come from live column rects, so follow window and split-handle resizes.
  useEffect(() => {
    if (!docked) return;
    const workspace = slotRef.current?.closest(".workspace");
    const observer = new ResizeObserver(relayout);
    if (workspace) observer.observe(workspace);
    document.querySelectorAll(".main-scroll, .chat-panel").forEach((el) => observer.observe(el));
    window.addEventListener("resize", relayout);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", relayout);
    };
  }, [docked]);

  // Lift-off: animate from where the shrinking in-page video was to its floating spot.
  useLayoutEffect(() => {
    const card = cardRef.current;
    const from = lastRectRef.current;
    if (!docked || !card || !from || prefersReducedMotion()) return;
    const to = card.getBoundingClientRect();
    card.animate(
      [
        {
          transformOrigin: "top left",
          transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`,
        },
        { transformOrigin: "top left", transform: "none" },
      ],
      { duration: 460, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
    );
  }, [docked]);

  function startDrag(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || (e.target as Element).closest("button")) return;
    const r = cardRef.current!.getBoundingClientRect();
    const ox = e.clientX - r.left;
    const oy = e.clientY - r.top;
    setInteraction("drag");
    trackPointer(
      e,
      (ev) => setFree({ x: ev.clientX - ox, y: ev.clientY - oy }),
      (ev) => {
        // Snap to whichever column corner is closest to where the player was dropped.
        const cx = ev.clientX - ox + r.width / 2;
        const cy = ev.clientY - oy + r.height / 2;
        let best: { d: number; next: Dock } | undefined;
        for (const area of ["main", "chat"] as const) {
          const rect = areaRect(area);
          if (!rect) continue;
          const width = clampWidth(dock.width, rect);
          const height = miniHeight(width, hasStrip);
          for (const corner of ["tl", "tr", "bl", "br"] as const) {
            const p = cornerPosition(rect, corner, width, height);
            const d = Math.hypot(p.x + width / 2 - cx, p.y + height / 2 - cy);
            if (!best || d < best.d) best = { d, next: { area, corner, width } };
          }
        }
        if (best) {
          setDock(best.next);
          saveDock(best.next);
        }
        setFree(null);
        setInteraction(null);
      },
    );
  }

  function startResize(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const rect = areaRect(dock.area);
    if (!rect) return;
    // The docked corner stays pinned; the handle sits on the opposite corner.
    const r = cardRef.current!.getBoundingClientRect();
    const anchorX = dock.corner[1] === "r" ? r.right : r.left;
    const anchorY = dock.corner[0] === "b" ? r.bottom : r.top;
    const widthAt = (ev: PointerEvent) => {
      const byX = Math.abs(anchorX - ev.clientX);
      const byY = ((Math.abs(anchorY - ev.clientY) - MINI_BAR_HEIGHT - (hasStrip ? MINI_STRIP_HEIGHT : 0)) * 16) / 9;
      return clampWidth(Math.max(byX, byY), rect);
    };
    setInteraction("resize");
    trackPointer(
      e,
      (ev) => setDock((d) => ({ ...d, width: widthAt(ev) })),
      (ev) => {
        const next = { ...dock, width: widthAt(ev) };
        setDock(next);
        saveDock(next);
        setInteraction(null);
      },
    );
  }

  let floatStyle: CSSProperties | undefined;
  if (docked) {
    const rect = typeof window === "undefined" ? null : areaRect(dock.area) ?? areaRect("main");
    if (rect) {
      const width = clampWidth(dock.width, rect);
      const pos = free ?? cornerPosition(rect, dock.corner, width, miniHeight(width, hasStrip));
      floatStyle = { left: pos.x, top: pos.y, width };
    }
  }

  // The iframe never moves in the DOM (that would reload it); docking only restyles its card,
  // while the slot keeps the full-size space so the page doesn't jump.
  return (
    <div className="video-block">
      <div className="video-slot" ref={slotRef}>
        <div
          ref={cardRef}
          className={`video-player ${docked ? "docked" : ""} ${hasStrip ? "has-strip" : ""} ${interaction ? `is-${interaction}` : ""}`}
          style={floatStyle}
        >
          <div className="video-frame-wrap">
            <div className="video-mount" ref={mountRef} />
          </div>
          {docked && (
            <>
              <div className="mini-bar" onPointerDown={startDrag} title="Drag to move">
                <span className="mini-grip">
                  <GripIcon />
                </span>
                <span className="mini-title">{title}</span>
                <button
                  type="button"
                  className="mini-btn"
                  aria-label="Back to the full video"
                  title="Back to the full video"
                  onClick={() => slotRef.current?.closest(".main-scroll")?.scrollTo({ top: 0, behavior: "smooth" })}
                >
                  <ArrowUpIcon />
                </button>
                <button
                  type="button"
                  className="mini-btn"
                  aria-label="Close mini player"
                  title="Close mini player"
                  onClick={() => {
                    handleRef?.current.player?.pauseVideo();
                    setStarted(false);
                  }}
                >
                  <CloseIcon />
                </button>
              </div>
              {hasStrip && <ChapterStrip markers={markers} fallbackDuration={fallbackDuration} variant="compact" />}
              <div
                className="mini-resize"
                data-corner={OPPOSITE[dock.corner]}
                onPointerDown={startResize}
                aria-label="Resize mini player"
                title="Drag to resize"
              />
            </>
          )}
        </div>
      </div>
      {hasStrip && <ChapterStrip markers={markers} fallbackDuration={fallbackDuration} variant="full" />}
    </div>
  );
}
