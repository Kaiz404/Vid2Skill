"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "./icons";
import { type ThemePreference, useTheme } from "./theme";

const OPTIONS: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Light", icon: <SunIcon /> },
  { value: "dark", label: "Dark", icon: <MoonIcon /> },
  { value: "system", label: "System", icon: <MonitorIcon /> },
];

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const activeIndex = OPTIONS.findIndex((o) => o.value === preference);

  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Theme">
      <div className="theme-toggle-thumb" style={{ transform: `translateX(${activeIndex * 100}%)` }} />
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={preference === opt.value}
          aria-label={opt.label}
          title={opt.label}
          className={preference === opt.value ? "active" : ""}
          onClick={() => setPreference(opt.value)}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}
