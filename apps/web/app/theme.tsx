"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type ThemePreference = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "vid2skill-theme";

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(resolved: ResolvedTheme): void {
  document.documentElement.setAttribute("data-theme", resolved);
}

/**
 * Defaults to "system" on both server and first client render so hydration always matches;
 * the real stored preference (if any) is picked up a tick later in the mount effect below.
 * The blocking inline script in layout.tsx already paints the correct theme before this runs.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<ResolvedTheme>("light");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const initial: ThemePreference = stored === "light" || stored === "dark" ? stored : "system";
    setPreferenceState(initial);
    const r = initial === "system" ? (systemPrefersDark() ? "dark" : "light") : initial;
    setResolved(r);
    applyTheme(r);
  }, []);

  useEffect(() => {
    if (preference !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const r: ResolvedTheme = mq.matches ? "dark" : "light";
      setResolved(r);
      applyTheme(r);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = (p: ThemePreference): void => {
    setPreferenceState(p);
    window.localStorage.setItem(STORAGE_KEY, p);
    const r: ResolvedTheme = p === "system" ? (systemPrefersDark() ? "dark" : "light") : p;
    setResolved(r);
    applyTheme(r);
  };

  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

/** Runs before paint (see layout.tsx) so there's no flash of the wrong theme. */
export const NO_FLASH_SCRIPT = `(function(){try{var KEY="${STORAGE_KEY}";var stored=localStorage.getItem(KEY);var theme=(stored==="light"||stored==="dark")?stored:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.setAttribute("data-theme",theme);}catch(e){}})();`;
