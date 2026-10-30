import { createStore, del, get, set, values } from "idb-keyval";

export type Mode = "skill" | "summary";
export type ChatIntent = "ask" | "edit";

/** A transcript chunk; times are in seconds. Mirrors `transcript.Segment` in core. */
export interface Segment {
  start: number;
  dur: number;
  text: string;
}

export interface DocVersion {
  id: string;
  content: string;
  createdAt: number;
  /** The chat message that asked for this revision; absent for the generated original. */
  editMessageId?: string;
}

export type ChatMessage =
  | { id: string; role: "user"; intent: ChatIntent; text: string; createdAt: number }
  | {
      id: string;
      role: "assistant";
      intent: ChatIntent;
      text: string;
      createdAt: number;
      status: "done" | "error";
      versionId?: string;
    };

export interface Session {
  id: string;
  videoId: string;
  title: string;
  mode: Mode;
  slug: string;
  createdAt: number;
  segments: Segment[];
  versions: DocVersion[];
  activeVersionId: string;
  messages: ChatMessage[];
}

export type SessionSummary = Pick<Session, "id" | "videoId" | "title" | "mode" | "createdAt">;

const MAX_SESSIONS = 20;

// Created lazily: idb-keyval touches `indexedDB` on creation, which doesn't exist during SSR.
let store: ReturnType<typeof createStore> | undefined;
function sessionStore() {
  store ??= createStore("vid2skill", "sessions");
  return store;
}

export async function getSession(id: string): Promise<Session | undefined> {
  return get<Session>(id, sessionStore());
}

export async function saveSession(session: Session): Promise<void> {
  await set(session.id, session, sessionStore());
}

/** Saves a freshly generated session and evicts the oldest beyond the cap. */
export async function addSession(session: Session): Promise<void> {
  await saveSession(session);
  const all = await values<Session>(sessionStore());
  const stale = all.sort((a, b) => b.createdAt - a.createdAt).slice(MAX_SESSIONS);
  await Promise.all(stale.map((s) => del(s.id, sessionStore())));
}

export async function listSessions(): Promise<SessionSummary[]> {
  const all = await values<Session>(sessionStore());
  return all
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(({ id, videoId, title, mode, createdAt }) => ({ id, videoId, title, mode, createdAt }));
}

export function activeContent(session: Session): string {
  return session.versions.find((v) => v.id === session.activeVersionId)?.content ?? "";
}
