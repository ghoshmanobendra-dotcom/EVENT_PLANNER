import { createHash } from 'node:crypto';
import { createLruCache } from '../lib/cache.js';
import { generatePlan } from '../lib/gemini.js';
import { HttpError, errorResponse, json, readJsonBody } from '../lib/http.js';
import { enrichPlan, toIsoDate } from '../lib/planner.js';
import { buildPrompt } from '../lib/prompt.js';
import { createRateLimiter } from '../lib/rate-limit.js';
import { parseGeneratedPlan, parsePlanRequest } from '../lib/schema.js';

export const config = { maxDuration: 60 };

const MAX_BODY_BYTES = 32 * 1024;
const CACHE_MAX_ENTRIES = 200;
const CACHE_TTL_MS = 10 * 60 * 1000;
const RATE_LIMIT_REQUESTS = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

/** Vercel sets x-forwarded-for itself, so its first entry is the real client address. */
const clientKey = (request) =>
  request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';

const cacheKey = (input) => createHash('sha256').update(JSON.stringify(input)).digest('hex');

/**
 * Builds the POST /api/plan handler. Dependencies are injected so tests can
 * swap Gemini for a fake and control the clock.
 * @param {{
 *   generate: (prompt: { systemInstruction: string, contents: string }) => Promise<string>,
 *   now?: () => number,
 *   cache?: ReturnType<typeof createLruCache>,
 *   limiter?: ReturnType<typeof createRateLimiter>,
 * }} deps
 */
export function createPlanHandler({
  generate,
  now = Date.now,
  // ponytail: cache and limiter live per function instance; move to Vercel Runtime Cache and a
  // Vercel Firewall rate-limit rule if traffic spreads across many instances.
  cache = createLruCache({ max: CACHE_MAX_ENTRIES, ttlMs: CACHE_TTL_MS, now }),
  limiter = createRateLimiter({ limit: RATE_LIMIT_REQUESTS, windowMs: RATE_LIMIT_WINDOW_MS, now }),
}) {
  return async function handlePlan(request) {
    try {
      const { allowed, retryAfterSeconds } = limiter(clientKey(request));
      if (!allowed) {
        throw new HttpError(429, 'RATE_LIMITED', 'Too many plans in a short time. Please wait a moment.', {
          headers: { 'retry-after': String(retryAfterSeconds) },
        });
      }

      const today = toIsoDate(now());
      const input = parsePlanRequest(await readJsonBody(request, MAX_BODY_BYTES), today);

      const key = cacheKey(input);
      let plan = cache.get(key);
      if (!plan) {
        plan = parseGeneratedPlan(await generate(buildPrompt(input)));
        cache.set(key, plan);
      }

      return json({ plan: enrichPlan(plan, { budget: input.budget, eventDate: input.eventDate, today }) });
    } catch (error) {
      if (error instanceof HttpError) return errorResponse(error);
      console.error('plan_request_failed', error?.name);
      return errorResponse(new HttpError(500, 'INTERNAL', 'Something went wrong. Please try again.'));
    }
  };
}

export const POST = createPlanHandler({ generate: generatePlan });
