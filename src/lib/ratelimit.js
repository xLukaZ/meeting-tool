import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const limiters = redis
  ? {
      book: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, "1 h"),
        prefix: "ratelimit:book",
      }),
      cancel: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, "1 h"),
        prefix: "ratelimit:cancel",
      }),
    }
  : {};

export async function checkRateLimit(ip, action) {
  if (!redis || !limiters[action]) {
    return { success: true };
  }

  const identifier = `${action}:${ip || "unknown"}`;
  const result = await limiters[action].limit(identifier);
  return { success: result.success };
}
