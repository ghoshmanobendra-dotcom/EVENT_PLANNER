import { ApiError, GoogleGenAI, ThinkingLevel } from '@google/genai';
import { HttpError } from './http.js';
import { GENERATED_PLAN_JSON_SCHEMA } from './schema.js';

// Measured on a full plan: flash-lite ~13 s, gemini-3.8-flash 28-139 s (past the 60 s function limit).
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const TIMEOUT_MS = 45_000;
const MAX_OUTPUT_TOKENS = 8192;
const RETRY_DELAY_MS = 800;
const RETRYABLE_STATUSES = new Set([429, 500, 503]);

/** @type {GoogleGenAI | undefined} Created lazily and reused across warm invocations. */
let client;

/** @param {unknown} error */
const isRetryable = (error) => error instanceof ApiError && RETRYABLE_STATUSES.has(error.status);

/** @param {unknown} error */
function toHttpError(error) {
  // The SDK re-aborts our timeout signal without a reason, so fetch rejects with AbortError.
  if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) {
    return new HttpError(504, 'AI_TIMEOUT', 'The assistant took too long to respond. Please try again.');
  }
  return new HttpError(502, 'AI_UNAVAILABLE', 'The assistant is unavailable right now. Please try again shortly.');
}

/**
 * Calls Gemini with structured output and returns the raw JSON text.
 * Transient upstream failures get exactly one retry.
 * @param {{ systemInstruction: string, contents: string }} prompt
 * @returns {Promise<string>}
 */
export async function generatePlan({ systemInstruction, contents }) {
  if (!process.env.GEMINI_API_KEY) {
    throw new HttpError(503, 'AI_NOT_CONFIGURED', 'The assistant is not configured yet.');
  }
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  // One deadline for both attempts, so a retry cannot outlive the function's maxDuration.
  const abortSignal = AbortSignal.timeout(TIMEOUT_MS);
  const call = () =>
    client.models.generateContent({
      model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
      contents,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseJsonSchema: GENERATED_PLAN_JSON_SCHEMA,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        abortSignal,
      },
    });

  try {
    let response;
    try {
      response = await call();
    } catch (error) {
      if (!isRetryable(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      response = await call();
    }
    return response.text ?? '';
  } catch (error) {
    console.error('gemini_request_failed', error instanceof ApiError ? error.status : error?.name);
    throw toHttpError(error);
  }
}
