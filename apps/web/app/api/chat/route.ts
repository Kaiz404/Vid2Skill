import { buildChatSystemPrompt, streamLLM, transcript, type ChatIntent, type ChatMessage } from "@vid2skill/core";
import { env } from "../../../lib/env";
import { reserveChatTurn } from "../../../lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Roughly a 3-hour talk; past this the prompt stops fitting the free models' context. */
const MAX_TRANSCRIPT_CHARS = 250_000;
const MAX_DOCUMENT_CHARS = 60_000;
const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 8_000;

interface ChatRequest {
  intent: ChatIntent;
  mode: "skill" | "summary";
  title: string;
  segments: transcript.Segment[];
  document: string;
  messages: ChatMessage[];
}

/** The body comes straight from the browser, so it's parsed field by field rather than trusted. */
function parseRequest(body: unknown): ChatRequest | string {
  const b = body as Partial<Record<keyof ChatRequest, unknown>> | null;
  if (!b) return "Request body must be JSON.";
  if (b.intent !== "ask" && b.intent !== "edit") return "intent must be ask or edit.";
  if (b.mode !== "skill" && b.mode !== "summary") return "mode must be skill or summary.";
  if (typeof b.title !== "string" || typeof b.document !== "string") return "title and document are required.";
  if (b.document.length > MAX_DOCUMENT_CHARS) return "Document is too long.";
  if (!Array.isArray(b.segments) || !Array.isArray(b.messages)) return "segments and messages are required.";

  const segments: transcript.Segment[] = [];
  let transcriptChars = 0;
  for (const s of b.segments as Partial<transcript.Segment>[]) {
    if (typeof s?.start !== "number" || typeof s.dur !== "number" || typeof s.text !== "string") {
      return "Malformed transcript segment.";
    }
    transcriptChars += s.text.length;
    segments.push({ start: s.start, dur: s.dur, text: s.text });
  }
  if (transcriptChars > MAX_TRANSCRIPT_CHARS) return "This video's transcript is too long to chat about.";

  if (b.messages.length === 0 || b.messages.length > MAX_MESSAGES) return "Too many messages in this chat.";
  const messages: ChatMessage[] = [];
  for (const m of b.messages as Partial<ChatMessage>[]) {
    if ((m?.role !== "user" && m?.role !== "assistant") || typeof m.content !== "string") {
      return "Malformed chat message.";
    }
    if (m.content.length > MAX_MESSAGE_CHARS) return "A message is too long.";
    messages.push({ role: m.role, content: m.content });
  }
  if (messages.at(-1)?.role !== "user") return "The last message must be from the user.";

  return { intent: b.intent, mode: b.mode, title: b.title, segments, document: b.document, messages };
}

function ndjson(event: { t: "delta"; v: string } | { t: "error"; message: string } | { t: "done" }): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

export async function POST(req: Request): Promise<Response> {
  const parsed = parseRequest(await req.json().catch(() => null));
  if (typeof parsed === "string") {
    return Response.json({ error: "invalid_request", message: parsed }, { status: 400 });
  }

  if (!(await reserveChatTurn())) {
    return Response.json(
      { error: "busy", message: "Chat is at its hourly limit right now. Try again in a little while." },
      { status: 429 },
    );
  }

  const system = buildChatSystemPrompt(
    parsed.intent,
    parsed.mode,
    parsed.title,
    transcript.formatTranscript(parsed.segments),
    parsed.document,
  );
  const tokens = streamLLM([{ role: "system", content: system }, ...parsed.messages], env.openrouterApiKey, req.signal);

  // Pull the first token before responding so "every model failed" is a real HTTP error, not a broken stream.
  let first: IteratorResult<string>;
  try {
    first = await tokens.next();
  } catch (e) {
    console.error("[vid2skill] chat failed before first token", e);
    return Response.json(
      { error: "generation_failed", message: "The AI model couldn't answer right now. Please try again." },
      { status: 502 },
    );
  }

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (!first.done) controller.enqueue(ndjson({ t: "delta", v: first.value }));
        for await (const piece of tokens) controller.enqueue(ndjson({ t: "delta", v: piece }));
        controller.enqueue(ndjson({ t: "done" }));
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          console.error("[vid2skill] chat stream failed", e);
          controller.enqueue(ndjson({ t: "error", message: "The answer was cut off. Please try again." }));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
