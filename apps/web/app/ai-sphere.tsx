"use client";

import { createElement, useEffect } from "react";

export type SphereState =
  | "listening"
  | "working"
  | "searching"
  | "solving"
  | "connecting"
  | "weaving"
  | "composing"
  | "breathing"
  | "shaping"
  | "thinking"
  | "reasoning"
  | "planning"
  | "verifying"
  | "routing"
  | "syncing"
  | "recalling"
  | "waiting"
  | "coding"
  | "speaking"
  | "complete";

interface AiSphereProps {
  state: SphereState;
  size?: number;
  speed?: number;
  label?: string;
}

/**
 * React wrapper for the `<ai-sphere>` web component. The package defines the element against
 * `HTMLElement` at import time, so it's loaded in the browser only; until it registers, the
 * tag renders as an empty box of the right size and upgrades in place.
 */
export function AiSphere({ state, size = 64, speed = 1.65, label }: AiSphereProps) {
  useEffect(() => {
    void import("ai-spheres");
  }, []);

  return createElement("ai-sphere", {
    state,
    size,
    speed,
    "aria-label": label,
    style: { display: "inline-block", width: size, height: size, flex: "none" },
  });
}
