import { Resend } from 'resend';
import { HttpError, errorResponse, json, readJsonBody } from '../lib/http.js';
import { createRateLimiter } from '../lib/rate-limit.js';
import { parseContactRequest } from '../lib/schema.js';

const MAX_BODY_BYTES      = 32 * 1024;
const RATE_LIMIT_REQUESTS = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

/** Vercel sets x-forwarded-for itself, so its first entry is the real client address. */
const clientKey = (request) =>
  request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';

/**
 * Builds the POST /api/contact handler. Dependencies are injected so tests can
 * swap the mailer and control the clock.
 * @param {{
 *   sendEmail: (fields: import('../lib/schema.js').ContactRequest) => Promise<void>,
 *   now?: () => number,
 *   limiter?: ReturnType<typeof createRateLimiter>,
 * }} deps
 */
export function createContactHandler({
  sendEmail,
  now = Date.now,
  limiter = createRateLimiter({ limit: RATE_LIMIT_REQUESTS, windowMs: RATE_LIMIT_WINDOW_MS, now }),
}) {
  return async function handleContact(request) {
    try {
      const { allowed, retryAfterSeconds } = limiter(clientKey(request));
      if (!allowed) {
        throw new HttpError(429, 'RATE_LIMITED', 'Too many messages in a short time. Please wait a moment.', {
          headers: { 'retry-after': String(retryAfterSeconds) },
        });
      }

      const fields = parseContactRequest(await readJsonBody(request, MAX_BODY_BYTES));
      await sendEmail(fields);

      return json({ ok: true });
    } catch (error) {
      if (error instanceof HttpError) return errorResponse(error);
      console.error('contact_request_failed', error?.name);
      return errorResponse(new HttpError(500, 'INTERNAL', 'Something went wrong. Please try again.'));
    }
  };
}

/**
 * Sends the contact form via Resend.
 * Requires the RESEND_API_KEY and CONTACT_TO_EMAIL environment variables.
 * @param {import('../lib/schema.js').ContactRequest} fields
 */
async function sendViaResend({ name, email, subject, message }) {
  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.CONTACT_TO_EMAIL;
  if (!apiKey || !toEmail) {
    throw new HttpError(500, 'INTERNAL', 'Something went wrong. Please try again.');
  }
  const fromEmail = process.env.CONTACT_FROM_EMAIL || 'Event Planner <onboarding@resend.dev>';
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from:     fromEmail,
    to:       toEmail,
    replyTo:  `${name} <${email}>`,
    subject:  `[Contact] ${subject}`,
    text:     `Name: ${name}\nEmail: ${email}\n\n${message}`,
  });
  if (error) {
    console.error('resend_error', error.name, error.message);
    throw new HttpError(500, 'INTERNAL', 'Something went wrong. Please try again.');
  }
}

export const POST = createContactHandler({ sendEmail: sendViaResend });
