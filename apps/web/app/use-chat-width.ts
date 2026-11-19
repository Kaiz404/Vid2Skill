"use client";

import { useCallback, useEffect, useState, type KeyboardEvent, type PointerEvent } from "react";

const STORAGE_KEY = "vid2skill:chat-width";
const DEFAULT_WIDTH = 440;
const MIN_WIDTH = 320;
/** The document column never gets narrower than this. */
const MIN_MAIN_WIDTH = 420;
const KEY_STEP = 32;

function maxWidth(): number {
  return Math.max(MIN_WIDTH, window.innerWidth - MIN_MAIN_WIDTH - 64);
}

function clamp(width: number): number {
  return Math.round(Math.min(Math.max(width, MIN_WIDTH), maxWidth()));
}

/** Width of the chat column, dragged from the split handle and remembered on this device. */
export function useChatWidth() {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let stored: number | undefined;
    try {
      stored = Number(localStorage.getItem(STORAGE_KEY)) || undefined;
    } catch {
      // storage blocked - fall back to the default width
    }
    setWidth(clamp(stored ?? DEFAULT_WIDTH));
    const onResize = () => setWidth((w) => clamp(w));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const commit = useCallback((next: number) => {
    const clamped = clamp(next);
    setWidth(clamped);
    try {
      localStorage.setItem(STORAGE_KEY, String(clamped));
    } catch {
      // storage blocked - the width just won't persist
    }
  }, []);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const handle = e.currentTarget;
      handle.setPointerCapture(e.pointerId);
      // The chat column hugs the right edge, so its width is the distance from the pointer to it.
      const right = handle.parentElement!.getBoundingClientRect().right;
      setDragging(true);
      document.body.classList.add("resizing-x");

      const onMove = (ev: globalThis.PointerEvent) => setWidth(clamp(right - ev.clientX - 8));
      const onUp = (ev: globalThis.PointerEvent) => {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onUp);
        document.body.classList.remove("resizing-x");
        setDragging(false);
        commit(right - ev.clientX - 8);
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onUp);
    },
    [commit],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "ArrowLeft") commit(width + KEY_STEP);
      else if (e.key === "ArrowRight") commit(width - KEY_STEP);
      else return;
      e.preventDefault();
    },
    [commit, width],
  );

  const reset = useCallback(() => commit(DEFAULT_WIDTH), [commit]);

  return { width, dragging, onPointerDown, onKeyDown, reset };
}
