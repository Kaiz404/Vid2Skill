"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listSessions, type SessionSummary } from "../lib/session";
import { thumbnailUrl } from "../lib/youtube";

const SHOWN = 5;

function relativeDay(ts: number): string {
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export function RecentSessions() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  useEffect(() => {
    void listSessions().then(setSessions);
  }, []);

  if (sessions.length === 0) return null;

  return (
    <nav className="recent" aria-label="Recent sessions">
      <div className="recent-label">Recent on this device</div>
      {sessions.slice(0, SHOWN).map((s) => (
        <Link key={s.id} href={`/s/${s.id}`} className="recent-item">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbnailUrl(s.videoId)} alt="" loading="lazy" />
          <span className="recent-title">{s.title}</span>
          <span className="recent-meta">
            {s.mode} · {relativeDay(s.createdAt)}
          </span>
        </Link>
      ))}
    </nav>
  );
}
