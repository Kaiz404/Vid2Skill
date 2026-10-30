"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";

interface YTPlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      host: string;
      videoId: string;
      playerVars: Record<string, number>;
      events: { onReady: () => void };
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

export function VideoPlayer({ videoId }: { videoId: string }) {
  const handleRef = useContext(PlayerContext)?.handle;
  const mountRef = useRef<HTMLDivElement>(null);

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

  return <div className="video-card video-player" ref={mountRef} />;
}
