"use client";

import Link from "next/link";
import { useEffect, useReducer, useRef, useState } from "react";
import { ChatRequestError, streamChat } from "../lib/chat-client";
import { acceptRevision } from "../lib/revision";
import {
  activeContent,
  saveSession,
  type ChatIntent,
  type ChatMessage,
  type DocVersion,
  type Session,
} from "../lib/session";
import { ChatPanel, type Draft } from "./chat-panel";
import { ArrowLeftIcon, CopyIcon, DownloadIcon } from "./icons";
import { MarkdownView } from "./markdown-view";
import { PlayerProvider, VideoPlayer } from "./player";
import { ThemeToggle } from "./theme-toggle";

type SessionAction =
  | { type: "userMessage"; message: ChatMessage }
  | { type: "assistantMessage"; message: ChatMessage; version?: DocVersion }
  | { type: "selectVersion"; versionId: string };

function sessionReducer(session: Session, action: SessionAction): Session {
  switch (action.type) {
    case "userMessage":
      return { ...session, messages: [...session.messages, action.message] };
    case "assistantMessage":
      if (!action.version) return { ...session, messages: [...session.messages, action.message] };
      return {
        ...session,
        messages: [...session.messages, action.message],
        versions: [...session.versions, action.version],
        activeVersionId: action.version.id,
      };
    case "selectVersion":
      return { ...session, activeVersionId: action.versionId };
  }
}

function versionLabel(session: Session, version: DocVersion, index: number): string {
  if (!version.editMessageId) return `v${index + 1} · original`;
  const ask = session.messages.find((m) => m.id === version.editMessageId)?.text ?? "edit";
  return `v${index + 1} · ${ask.length > 32 ? `${ask.slice(0, 32)}…` : ask}`;
}

export function Workspace({ initial }: { initial: Session }) {
  const [session, dispatch] = useReducer(sessionReducer, initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [mobileTab, setMobileTab] = useState<"doc" | "chat">("doc");
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (session !== initial) void saveSession(session);
  }, [session, initial]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const docNoun = session.mode === "skill" ? "skill" : "summary";
  const editing = draft?.intent === "edit";
  const shownContent = editing ? draft.text : activeContent(session);

  async function send(intent: ChatIntent, text: string) {
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", intent, text, createdAt: Date.now() };
    dispatch({ type: "userMessage", message: userMessage });

    const controller = new AbortController();
    abortRef.current = controller;
    setDraft({ intent, text: "" });
    let latest = "";

    const reply = (fields: { text: string; status: "done" | "error"; version?: DocVersion }) =>
      dispatch({
        type: "assistantMessage",
        message: {
          id: crypto.randomUUID(),
          role: "assistant",
          intent,
          text: fields.text,
          status: fields.status,
          versionId: fields.version?.id,
          createdAt: Date.now(),
        },
        version: fields.version,
      });

    try {
      const full = await streamChat(
        {
          intent,
          mode: session.mode,
          title: session.title,
          segments: session.segments,
          document: activeContent(session),
          messages: [...session.messages, userMessage],
        },
        (t) => {
          latest = t;
          setDraft({ intent, text: t });
        },
        controller.signal,
      );

      if (intent === "ask") {
        reply({ text: full, status: "done" });
        return;
      }
      const revision = acceptRevision(session.mode, activeContent(session), full);
      if (!revision.ok) {
        reply({ text: revision.reason, status: "error" });
        return;
      }
      const version: DocVersion = {
        id: crypto.randomUUID(),
        content: revision.content,
        createdAt: Date.now(),
        editMessageId: userMessage.id,
      };
      reply({ text: `Revised the ${docNoun} (v${session.versions.length + 1}).`, status: "done", version });
    } catch (e) {
      if (controller.signal.aborted) {
        // A stopped answer is still worth keeping; a stopped rewrite is a half-document, so drop it.
        if (intent === "ask" && latest) reply({ text: `${latest}\n\n*(stopped)*`, status: "done" });
        return;
      }
      reply({
        text: e instanceof ChatRequestError ? e.message : "Something went wrong. Please try again.",
        status: "error",
      });
    } finally {
      abortRef.current = null;
      setDraft(null);
    }
  }

  async function copyContent() {
    try {
      await navigator.clipboard.writeText(shownContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard access denied/unavailable - nothing more we can do here
    }
  }

  function downloadContent() {
    const filename = session.mode === "skill" ? `${session.slug}.SKILL.md` : `${session.slug}.md`;
    const blob = new Blob([shownContent], { type: "text/markdown" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  return (
    <PlayerProvider>
      <div className="page-head wide">
        <Link href="/" className="back-link">
          <ArrowLeftIcon />
          New video
        </Link>
        <h1>vid2skill</h1>
        <ThemeToggle />
      </div>

      <div className="workspace" data-tab={mobileTab}>
        <section className="panel doc-panel">
          <div className="doc-head">
            <div className="result-head-text">
              <span className="title">{session.title}</span>
              <span className="badge">{session.mode}</span>
            </div>
            <div className="markdown-toolbar">
              {session.versions.length > 1 && (
                <select
                  className="version-select"
                  value={session.activeVersionId}
                  disabled={editing}
                  onChange={(e) => dispatch({ type: "selectVersion", versionId: e.target.value })}
                  aria-label="Document version"
                >
                  {session.versions.map((v, i) => (
                    <option key={v.id} value={v.id}>
                      {versionLabel(session, v, i)}
                    </option>
                  ))}
                </select>
              )}
              <button className="primary-a" onClick={copyContent} disabled={editing}>
                <CopyIcon />
                {copied ? "Copied!" : "Copy"}
              </button>
              <button className="ghost" onClick={downloadContent} disabled={editing}>
                <DownloadIcon />
                Download
              </button>
            </div>
          </div>
          {editing && <div className="shimmer-bar doc-shimmer" />}
          <div className="markdown-panel">
            <MarkdownView content={shownContent} mode={session.mode} segments={session.segments} />
          </div>
        </section>

        <div className="video-slot">
          <VideoPlayer videoId={session.videoId} />
        </div>

        <div className={`toggle workspace-tabs ${mobileTab === "chat" ? "mode-second" : ""}`}>
          <div className="toggle-thumb" />
          <button type="button" className={mobileTab === "doc" ? "active" : ""} onClick={() => setMobileTab("doc")}>
            {session.mode === "skill" ? "Skill" : "Summary"}
          </button>
          <button type="button" className={mobileTab === "chat" ? "active" : ""} onClick={() => setMobileTab("chat")}>
            Chat
          </button>
        </div>

        <ChatPanel
          messages={session.messages}
          versions={session.versions}
          activeVersionId={session.activeVersionId}
          draft={draft}
          docNoun={docNoun}
          segments={session.segments}
          onSend={send}
          onStop={() => abortRef.current?.abort()}
          onSelectVersion={(versionId) => {
            dispatch({ type: "selectVersion", versionId });
            setMobileTab("doc");
          }}
        />
      </div>
    </PlayerProvider>
  );
}
