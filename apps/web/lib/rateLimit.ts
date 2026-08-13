import { redis } from "./redis";

/**
 * Global (not per-user) rate limiting, backed by Upstash Redis since Vercel
 * functions share no memory across invocations. Two limits, hard-reject at
 * capacity, no queueing - see .scratch/vid2skill-web/issues/06-rate-limiting-policy.md.
 */
const CONCURRENCY_CAP = 2;
const HOURLY_QUOTA = 30;
const CONCURRENCY_KEY = "vid2skill:concurrency";
// Safety-net TTL for a reserved concurrency slot, in case a job's execution
// path never releases it (a crashed/killed invocation).
const SLOT_TTL_MS = 5 * 60_000;

function hourBucketKey(): string {
  const hour = Math.floor(Date.now() / 3_600_000);
  return `vid2skill:hourly:${hour}`;
}

export type ReservationResult = { ok: true } | { ok: false; reason: "hourly_quota" | "concurrency" };

/**
 * Reserve a slot for a new pipeline run, keyed by jobId. The reservation
 * outlives this request (it must be released later from the stream handler's
 * own, separate serverless invocation), so it's tracked in Redis rather than
 * returned as an in-memory closure - nothing here can rely on this process
 * still being alive when `releaseSlot` is eventually called.
 */
export async function reserveSlot(jobId: string): Promise<ReservationResult> {
  const r = redis();

  const hourlyCount = await r.incr(hourBucketKey());
  if (hourlyCount === 1) {
    await r.expire(hourBucketKey(), 3600);
  }
  if (hourlyCount > HOURLY_QUOTA) {
    await r.decr(hourBucketKey());
    return { ok: false, reason: "hourly_quota" };
  }

  const now = Date.now();
  await r.zremrangebyscore(CONCURRENCY_KEY, 0, now);
  const active = await r.zcard(CONCURRENCY_KEY);
  if (active >= CONCURRENCY_CAP) {
    return { ok: false, reason: "concurrency" };
  }

  await r.zadd(CONCURRENCY_KEY, { score: now + SLOT_TTL_MS, member: jobId });
  return { ok: true };
}

/** Release a previously reserved concurrency slot. Safe to call more than once. */
export async function releaseSlot(jobId: string): Promise<void> {
  await redis().zrem(CONCURRENCY_KEY, jobId);
}
