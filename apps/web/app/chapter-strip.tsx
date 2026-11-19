"use client";

import { useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { Marker } from "../lib/markers";
import { usePlayback, useSeek } from "./player";

/** Markers within this many pixels of the cursor swell, dock-style. */
const SWELL_RADIUS = 48;
/** A marker this close to the cursor (px) claims the tooltip and the click. */
const SNAP_PX = 10;
const SECTION_TONES = 4;

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

interface ChapterStripProps {
  markers: Marker[];
  /** Used until the player reports the real duration. */
  fallbackDuration: number;
  variant: "full" | "compact";
}

/** A timeline of the moments the document cites: hover to preview, click to jump. */
export function ChapterStrip({ markers, fallbackDuration, variant }: ChapterStripProps) {
  const seek = useSeek();
  const { time, duration: reported } = usePlayback();
  const trackRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; width: number } | null>(null);
  const [focused, setFocused] = useState<Marker | null>(null);

  const duration = Math.max(reported || fallbackDuration, markers.at(-1)?.seconds ?? 0, 1);
  const pct = (seconds: number) => `${Math.min(100, (seconds / duration) * 100)}%`;

  const tones = useMemo(() => {
    const order = new Map<string, number>();
    for (const m of markers) if (m.section && !order.has(m.section)) order.set(m.section, order.size % SECTION_TONES);
    return order;
  }, [markers]);

  const current = useMemo(() => [...markers].reverse().find((m) => m.seconds <= time + 0.5), [markers, time]);

  const hoverSeconds = hover ? (hover.x / hover.width) * duration : null;
  const nearest = useMemo(() => {
    if (!hover) return null;
    let best: { m: Marker; d: number } | null = null;
    for (const m of markers) {
      const d = Math.abs((m.seconds / duration) * hover.width - hover.x);
      if (d <= SNAP_PX && (!best || d < best.d)) best = { m, d };
    }
    return best?.m ?? null;
  }, [hover, markers, duration]);
  const tip = focused ?? nearest;

  function onMove(e: PointerEvent<HTMLDivElement>) {
    const r = trackRef.current!.getBoundingClientRect();
    setHover({ x: Math.min(Math.max(e.clientX - r.left, 0), r.width), width: r.width });
  }

  function onClick() {
    if (!seek || hoverSeconds === null) return;
    seek(nearest ? nearest.seconds : hoverSeconds);
  }

  return (
    <div className={`chapter-strip chapter-strip-${variant}`}>
      {variant === "full" && (
        <div className="chapter-now" aria-live="polite">
          <span className="chapter-now-label">{current ? "Now" : `${markers.length} cited moments`}</span>
          {current && (
            <button type="button" key={current.seconds} className="chapter-now-text" onClick={() => seek?.(current.seconds)}>
              <span className="chapter-time">{formatTime(current.seconds)}</span>
              {current.label}
            </button>
          )}
        </div>
      )}
      <div className="chapter-track" ref={trackRef} onPointerMove={onMove} onPointerLeave={() => setHover(null)} onClick={onClick}>
        <div className="chapter-rail">
          <div className="chapter-played" style={{ width: pct(time) }} />
        </div>
        {hover && !nearest && <div className="chapter-ghost" style={{ left: hover.x }} />}
        {markers.map((m) => {
          const x = (m.seconds / duration) * (hover?.width ?? 0);
          const swell = hover ? Math.max(0, 1 - Math.abs(x - hover.x) / SWELL_RADIUS) : 0;
          return (
            <button
              key={m.seconds}
              type="button"
              className={`chapter-mark ${m === current ? "is-current" : ""} ${m.seconds <= time ? "is-past" : ""}`}
              data-tone={tones.get(m.section ?? "") ?? 0}
              style={{ left: pct(m.seconds), "--swell": swell.toFixed(2) } as CSSProperties}
              aria-label={`${formatTime(m.seconds)}: ${m.label}`}
              onFocus={() => setFocused(m)}
              onBlur={() => setFocused(null)}
              onClick={(e) => {
                e.stopPropagation();
                seek?.(m.seconds);
              }}
            />
          );
        })}
        {tip ? (
          <div className="chapter-tip" style={{ left: pct(tip.seconds) }}>
            <span className="chapter-tip-head">
              <span className="chapter-time">{formatTime(tip.seconds)}</span>
              {tip.section && <span className="chapter-tip-section">{tip.section}</span>}
            </span>
            <span className="chapter-tip-label">{tip.label}</span>
          </div>
        ) : (
          hover &&
          hoverSeconds !== null && (
            <div className="chapter-tip chapter-tip-time" style={{ left: hover.x }}>
              {formatTime(hoverSeconds)}
            </div>
          )
        )}
      </div>
    </div>
  );
}
