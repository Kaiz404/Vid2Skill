import { Redis } from "@upstash/redis";
import { env } from "./env";

let client: Redis | undefined;

export function redis(): Redis {
  client ??= new Redis({ url: env.upstashRedisRestUrl, token: env.upstashRedisRestToken });
  return client;
}
