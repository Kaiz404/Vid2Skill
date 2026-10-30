import type { ChatIntent, ChatMessage, Mode, Segment } from "./session";

/** Keeps requests well under the route's message cap; older turns rarely matter for follow-ups. */
const HISTORY_LIMIT = 20;

export class ChatRequestError extends Error {}

interface ChatRequest {
  intent: ChatIntent;
  mode: Mode;
  title: string;
  segments: Segment[];
  document: string;
  messages: ChatMessage[];
}

/** Edit replies are whole documents, which already live in `document`; send a stand-in instead. */
function toWire(m: ChatMessage): { role: "user" | "assistant"; content: string } | null {
  if (m.role === "user") return { role: "user", content: m.text };
  if (m.status === "error") return null;
  return { role: "assistant", content: m.intent === "edit" ? "(I revised the document as requested.)" : m.text };
}

/** Streams a chat reply, calling `onDelta` with the accumulated text. Resolves with the full text. */
export async function streamChat(
  req: ChatRequest,
  onDelta: (text: string) => void,
  signal: AbortSignal,
): Promise<string> {
  const messages = req.messages
    .map(toWire)
    .filter((m) => m !== null)
    .slice(-HISTORY_LIMIT);

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...req, messages }),
    signal,
  });

  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new ChatRequestError(body.message ?? "Something went wrong. Please try again.");
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let text = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let newline: number;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const event = JSON.parse(line) as { t: "delta"; v: string } | { t: "error"; message: string } | { t: "done" };
      if (event.t === "error") throw new ChatRequestError(event.message);
      if (event.t === "delta") {
        text += event.v;
        onDelta(text);
      }
    }
  }
  return text;
}
