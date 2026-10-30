import { getJob } from "../../../../lib/jobs";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) {
    return Response.json({ error: "not_found", message: "Job not found." }, { status: 404 });
  }

  return Response.json({
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
  });
}
