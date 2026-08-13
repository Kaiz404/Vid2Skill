import type { Mode } from "@vid2skill/core";
import { redis } from "./redis";

export type JobStatus = "queued" | "running" | "done" | "error";

export interface JobRecord {
  id: string;
  url: string;
  mode: Mode;
  status: JobStatus;
  phase?: string;
  title?: string;
  slug?: string;
  content?: string;
  errorHeading?: string;
  errorMessage?: string;
  createdAt: number;
}

const JOB_TTL_SECONDS = 3600;
const LOCK_TTL_SECONDS = 300;

function jobKey(id: string): string {
  return `vid2skill:job:${id}`;
}

function lockKey(id: string): string {
  return `vid2skill:lock:${id}`;
}

export async function createJob(id: string, url: string, mode: Mode): Promise<JobRecord> {
  const job: JobRecord = { id, url, mode, status: "queued", createdAt: Date.now() };
  await redis().set(jobKey(id), job, { ex: JOB_TTL_SECONDS });
  return job;
}

export async function getJob(id: string): Promise<JobRecord | null> {
  return (await redis().get<JobRecord>(jobKey(id))) ?? null;
}

export async function updateJob(id: string, patch: Partial<JobRecord>): Promise<JobRecord | null> {
  const current = await getJob(id);
  if (!current) return null;
  const next: JobRecord = { ...current, ...patch };
  await redis().set(jobKey(id), next, { ex: JOB_TTL_SECONDS });
  return next;
}

/** Best-effort single-runner lock so a duplicate stream/poll request doesn't re-run the pipeline. */
export async function acquireRunLock(id: string): Promise<boolean> {
  const result = await redis().set(lockKey(id), "1", { nx: true, ex: LOCK_TTL_SECONDS });
  return result === "OK";
}
