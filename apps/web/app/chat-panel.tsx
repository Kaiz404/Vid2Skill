"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatIntent, ChatMessage, DocVersion, Segment } from "../lib/session";
import { AiSphere } from "./ai-sphere";
import { ArrowUpIcon, StopIcon } from "./icons";
import { MarkdownView } from "./markdown-view";

export interface Draft {
  intent: ChatIntent;
  text: string;
}

const STARTERS: Record<ChatIntent, string[]> = {
  ask: ["What's the single most important takeaway?", "What concrete examples are given?", "Where does the speaker disagree with common practice?"],
  edit: ["Make it shorter and punchier", "Add a section on the examples used", "Rewrite the key points as an actionable checklist"],
};

interface ChatPanelProps {
  messages: ChatMessage[];
  versions: DocVersion[];
  activeVersionId: string;
  draft: Draft | null;
  docNoun: string;
  segments: Segment[];
  onSend: (intent: ChatIntent, text: string) => void;
  onStop: () => void;
  onSelectVersion: (versionId: string) => void;
}

export function ChatPanel({
  messages,
  versions,
  activeVersionId,
  draft,
  docNoun,
  segments,
  onSend,
  onStop,
  onSelectVersion,
}: ChatPanelProps) {
  const [intent, setIntent] = useState<ChatIntent>("ask");
  const [input, setInput] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);
  const busy = draft !== null;

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, draft?.text]);

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    onSend(intent, trimmed);
    setInput("");
  }

  return (
    <section className="panel chat-panel">
      <div className="chat-thread" ref={threadRef}>
        {messages.length === 0 && !busy && (
          <div className="chat-empty">
            <p>
              {intent === "ask"
                ? "Ask anything about the video. Answers cite the moment they come from, so you can jump straight to it."
                : `Describe a change and the ${docNoun} is rewritten. Earlier versions stay one click away.`}
            </p>
            <div className="chat-starters">
              {STARTERS[intent].map((s) => (
                <button key={s} type="button" onClick={() => submit(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="msg msg-user">
              {m.intent === "edit" && <span className="msg-tag">Edit</span>}
              {m.text}
            </div>
          ) : m.status === "error" ? (
            <div key={m.id} className="msg msg-error">
              {m.text}
            </div>
          ) : m.intent === "edit" && m.versionId ? (
            <button
              key={m.id}
              type="button"
              className={`msg msg-revision ${m.versionId === activeVersionId ? "active" : ""}`}
              onClick={() => onSelectVersion(m.versionId!)}
            >
              {m.text}
              <span>{m.versionId === activeVersionId ? "Showing" : "View"}</span>
            </button>
          ) : (
            <div key={m.id} className="msg msg-assistant">
              <MarkdownView content={m.text} mode="summary" segments={segments} />
            </div>
          ),
        )}

        {draft?.intent === "ask" && (
          <div className="msg msg-assistant">
            {draft.text ? (
              <MarkdownView content={draft.text} mode="summary" segments={segments} />
            ) : (
              <span className="msg-pending">
                <AiSphere state="searching" size={28} />
                Reading the transcript…
              </span>
            )}
          </div>
        )}
        {draft?.intent === "edit" && (
          <div className="msg msg-revision pending">
            <span className="msg-pending">
              <AiSphere state="composing" size={24} />
              Rewriting the {docNoun} (v{versions.length + 1})…
            </span>
          </div>
        )}
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <div className={`toggle chat-intent ${intent === "edit" ? "mode-second" : ""}`}>
          <div className="toggle-thumb" />
          <button type="button" className={intent === "ask" ? "active" : ""} onClick={() => setIntent("ask")}>
            Ask
          </button>
          <button type="button" className={intent === "edit" ? "active" : ""} onClick={() => setIntent("edit")}>
            Edit
          </button>
        </div>
        <div className="chat-box">
          <textarea
            rows={2}
            value={input}
            placeholder={intent === "ask" ? "Ask about the video…" : `Describe a change to the ${docNoun}…`}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit(input);
              }
            }}
          />
          {busy ? (
            <button type="button" className="chat-send" onClick={onStop} aria-label="Stop">
              <StopIcon />
            </button>
          ) : (
            <button type="submit" className="chat-send" disabled={!input.trim()} aria-label="Send">
              <ArrowUpIcon />
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
