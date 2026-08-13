function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  get supadataApiKey() {
    return required("SUPADATA_API_KEY");
  },
  get openrouterApiKey() {
    return required("OPENROUTER_API_KEY");
  },
  get upstashRedisRestUrl() {
    return required("UPSTASH_REDIS_REST_URL");
  },
  get upstashRedisRestToken() {
    return required("UPSTASH_REDIS_REST_TOKEN");
  },
  get umamiWebsiteId() {
    return process.env.UMAMI_WEBSITE_ID;
  },
};
