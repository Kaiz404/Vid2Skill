"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getSession, type Session } from "../../../lib/session";
import { Workspace } from "../../workspace";

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    void getSession(id).then((s) => setSession(s ?? null));
  }, [id]);

  if (session === undefined) return null;
  if (session === null) {
    return (
      <div className="card">
        <h2>This session isn&apos;t on this device</h2>
        <p className="sub">
          Sessions are stored only in the browser that created them, and the oldest are cleared after 20.
        </p>
        <Link href="/" className="primary as-link">
          Generate a new one
        </Link>
      </div>
    );
  }
  return <Workspace key={session.id} initial={session} />;
}
