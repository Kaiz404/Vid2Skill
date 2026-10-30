"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { CloseIcon } from "./icons";

interface YTPlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
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

const PlayerContext = createContext<{ seek: Seek; handle: RefObject<PlayerHandle> } | null>(null);

/** Null outside a workspace, so timestamp chips render as plain text there. */
export function useSeek(): Seek | null {
  return useContext(PlayerContext)?.seek ?? null;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const handle = useRef<PlayerHandle>({ ready: false });

  const seek = useCallback<Seek>((seconds) => {
    const h = handle.current;
    if (!h.ready || !h.player) {
      h.pendingSeek = seconds;
      return;
    }
    h.player.seekTo(seconds, true);
    h.player.playVideo();
  }, []);

  const value = useMemo(() => ({ seek, handle }), [seek]);
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

const YT_ENDED = 0;
const YT_PLAYING = 1;

/** Below this much of the slot on screen, a started video docks as a mini player. */
const DOCK_VISIBLE_RATIO = 0.35;

export function VideoPlayer({ videoId }: { videoId: string }) {
  const handleRef = useContext(PlayerContext)?.handle;
  const slotRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const [inView, setInView] = useState(true);

  useEffect(() => {
    if (!handleRef || !mountRef.current) return;
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
            if (h.pendingSeek !== undefined) {
              h.player?.seekTo(h.pendingSeek, true);
              h.player?.playVideo();
              h.pendingSeek = undefined;
            }
          },
          onStateChange: (e) => {
            if (e.data === YT_PLAYING) setStarted(true);
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
    };
  }, [handleRef, videoId]);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry!.intersectionRatio >= DOCK_VISIBLE_RATIO), {
      threshold: [0, DOCK_VISIBLE_RATIO, 1],
    });
    observer.observe(slot);
    return () => observer.disconnect();
  }, []);

  const docked = started && !inView;

  // The iframe never moves in the DOM (that would reload it); docking only restyles its card,
  // while the slot keeps the full-size space so the page doesn't jump.
  return (
    <div className="video-slot" ref={slotRef}>
      <div className={`video-card video-player ${docked ? "docked" : ""}`}>
        <div className="video-mount" ref={mountRef} />
        {docked && (
          <button
            type="button"
            className="video-undock"
            aria-label="Close mini player"
            onClick={() => {
              handleRef?.current.player?.pauseVideo();
              setStarted(false);
            }}
          >
            <CloseIcon />
          </button>
        )}
      </div>
    </div>
  );
}
