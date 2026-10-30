import {
  LLMError,
  SkillGenerationFailedError,
  TranscriptUnavailableError,
  pipeline,
} from "@vid2skill/core";
import { env } from "../../../../../lib/env";
import { acquireRunLock, getJob, updateJob, type JobRecord } from "../../../../../lib/jobs";
import { releaseSlot } from "../../../../../lib/rateLimit";

export const runtime = "nodejs";
/** LLM + transcript work can exceed Vercel's default 10s function limit. */
export const maxDuration = 300;

const POLL_INTERVAL_MS = 1000;
const MAX_STREAM_MS = 6 * 60_000;

function sseMessage(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function friendlyError(e: unknown): { heading: string; message: string } {
  if (e instanceof TranscriptUnavailableError) {
    return {
      heading: "We couldn't get a transcript for this video",
      message: "It may not have captions available — try a different link.",
    };
  }
  if (e instanceof LLMError || e instanceof SkillGenerationFailedError) {
    return {
      heading: "Generation failed",
      message: "The AI model had trouble generating output for this video. Please try again.",
    };
  }
  return { heading: "Something went wrong", message: "Please try again." };
}

function jobSnapshot(job: JobRecord) {
  return {
    status: job.status,
    phase: job.phase,
    mode: job.mode,
    title: job.title,
    slug: job.slug,
    content: job.content,
    videoId: job.videoId,
    segments: job.segments,
    errorHeading: job.errorHeading,
    errorMessage: job.errorMessage,
  };
}

/** Actually run the pipeline, streaming phase updates and mirroring them into
 * Redis so `GET /api/jobs/[id]` (the polling fallback) stays in sync. */
async function runAndStream(
  id: string,
  job: JobRecord,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
): Promise<void> {
  await updateJob(id, { status: "running", phase: "extract" });

  const emitPhase = (phase: string) => {
    controller.enqueue(encoder.encode(sseMessage("phase", { phase })));
    void updateJob(id, { phase });
  };

  try {
    const result = await pipeline.run(job.url, job.mode, {
      supadataApiKey: env.supadataApiKey,
      openrouterApiKey: env.openrouterApiKey,
      timeoutMs: 280_000,
      onPhase: emitPhase,
    });

    const updated = await updateJob(id, {
      status: "done",
      title: result.title,
      slug: result.slug,
      content: result.content,
      videoId: result.videoId,
      segments: result.segments,
    });
    controller.enqueue(encoder.encode(sseMessage("done", jobSnapshot(updated!))));
  } catch (e) {
    console.error("[vid2skill] job failed", id, e);
    const { heading, message } = friendlyError(e);
    const updated = await updateJob(id, { status: "error", errorHeading: heading, errorMessage: message });
    controller.enqueue(encoder.encode(sseMessage("error", jobSnapshot(updated!))));
  } finally {
    await releaseSlot(id);
    controller.close();
  }
}

/** A second stream request for a job already being run by another invocation
 * (no shared memory across serverless invocations to attach to instead):
 * relay its progress by polling the Redis job record. */
async function relayByPolling(
  id: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
): Promise<void> {
  const deadline = Date.now() + MAX_STREAM_MS;
  let lastPhase: string | undefined;

  while (Date.now() < deadline) {
    const job = await getJob(id);
    if (!job) {
      controller.enqueue(
        encoder.encode(sseMessage("error", { errorHeading: "Something went wrong", errorMessage: "Job not found." })),
      );
      break;
    }
    if (job.phase !== lastPhase) {
      lastPhase = job.phase;
      controller.enqueue(encoder.encode(sseMessage("phase", { phase: job.phase })));
    }
    if (job.status === "done" || job.status === "error") {
      controller.enqueue(encoder.encode(sseMessage(job.status, jobSnapshot(job))));
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  controller.close();
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) {
    return Response.json({ error: "not_found", message: "Job not found." }, { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      if (job.status === "done" || job.status === "error") {
        controller.enqueue(encoder.encode(sseMessage(job.status, jobSnapshot(job))));
        controller.close();
        return;
      }

      const gotLock = await acquireRunLock(id);
      if (gotLock) {
        await runAndStream(id, job, controller, encoder);
      } else {
        await relayByPolling(id, controller, encoder);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
