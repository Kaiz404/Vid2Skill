import { InvalidVideoURLError, normalizeYoutubeUrl, type Mode } from "@vid2skill/core";
import { randomUUID } from "node:crypto";
import { createJob } from "../../../lib/jobs";
import { reserveSlot } from "../../../lib/rateLimit";

export const runtime = "nodejs";

const BUSY_MESSAGE = "Server is handling a lot of load right now — please try again in a minute or two.";

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { url?: unknown; mode?: unknown } | null;

  const url = typeof body?.url === "string" ? body.url.trim() : "";
  const mode = body?.mode === "summary" ? "summary" : body?.mode === "skill" ? "skill" : undefined;

  if (!url || !mode) {
    return Response.json(
      { error: "invalid_request", message: "A YouTube url and a mode (skill|summary) are required." },
      { status: 400 },
    );
  }

  try {
    normalizeYoutubeUrl(url);
  } catch (e) {
    if (e instanceof InvalidVideoURLError) {
      return Response.json(
        { error: "invalid_url", message: "That doesn't look like a valid YouTube URL." },
        { status: 400 },
      );
    }
    throw e;
  }

  const id = randomUUID();
  const reservation = await reserveSlot(id);
  if (!reservation.ok) {
    return Response.json({ error: "busy", message: BUSY_MESSAGE }, { status: 429 });
  }

  await createJob(id, url, mode as Mode);
  return Response.json({ id }, { status: 201 });
}
