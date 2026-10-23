import { z } from 'zod';
import { EVENT_TYPES } from './event-types.js';
import { HttpError } from './http.js';

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED'];
export const LANGUAGES = ['English', 'Hindi', 'Tamil', 'Bengali', 'Spanish', 'French'];
export const IDEA_AREAS = ['theme', 'decor', 'food', 'activities', 'guest-experience'];

const MAX_GUESTS = 5000;
const MAX_BUDGET = 1_000_000_000;
const MAX_YEARS_AHEAD = 3;
const CONTROL_CHARS = /\p{Cc}+/gu;

/** Free text from users ends up in a prompt, so it is trimmed, bounded and flattened to one line. */
const userText = (min, max) =>
  z.string().trim().min(min).max(max).transform((value) => value.replace(CONTROL_CHARS, ' '));

const weeksBefore = (description) => z.int().min(0).max(104).describe(description);

/** The shape Gemini must return. Doubles as its `responseJsonSchema`. */
export const GeneratedPlan = z.object({
  summary: z.string().describe('Two or three sentences capturing the overall concept of the plan.'),
  budget: z
    .array(
      z.object({
        category: z.string(),
        weight: z.int().min(1).max(100).describe('Relative share of the total budget, as a whole-number percentage.'),
        tip: z.string().describe('One concrete way to save money or get more value in this category.'),
      }),
    )
    .min(3)
    .max(12),
  timeline: z
    .array(
      z.object({
        task: z.string(),
        details: z.string().describe('One sentence on what doing this task involves.'),
        weeksBefore: weeksBefore('Whole weeks before the event day when this should be done; 0 is event week.'),
      }),
    )
    .min(4)
    .max(20),
  vendors: z
    .array(
      z.object({
        category: z.string(),
        lookFor: z.string().describe('What makes a good vendor of this kind for this particular event.'),
        questions: z.array(z.string()).min(2).max(4).describe('Questions to ask before booking.'),
        weeksBefore: weeksBefore('Latest sensible booking time, in whole weeks before the event day.'),
      }),
    )
    .min(3)
    .max(10),
  ideas: z
    .array(
      z.object({
        area: z.enum(IDEA_AREAS),
        title: z.string(),
        description: z.string(),
        whyItFits: z.string().describe("One sentence tying the idea to the user's own details."),
      }),
    )
    .min(4)
    .max(10),
});

/** Gemini supports a JSON Schema subset that does not include `$schema`. */
export const GENERATED_PLAN_JSON_SCHEMA = z.toJSONSchema(GeneratedPlan);
delete GENERATED_PLAN_JSON_SCHEMA.$schema;

const PlanRequest = z
  .strictObject({
    eventType: z.enum(Object.keys(EVENT_TYPES)),
    candidateName: userText(0, 100).default(''),
    eventDate: z.iso.date(),
    location: userText(2, 80),
    guestCount: z.int().min(1).max(MAX_GUESTS),
    budget: z.int().min(1).max(MAX_BUDGET),
    currency: z.enum(CURRENCIES),
    vibe: userText(0, 200).default(''),
    priorities: userText(0, 500).default(''),
    language: z.enum(LANGUAGES).default('English'),
    feedback: userText(3, 300).optional(),
    previousPlan: GeneratedPlan.optional(),
  })
  .refine((request) => !request.feedback === !request.previousPlan, {
    path: ['feedback'],
    error: 'A change request needs the plan it refers to.',
  });

/** @typedef {z.infer<typeof PlanRequest>} PlanRequest */
/** @typedef {z.infer<typeof GeneratedPlan>} GeneratedPlan */

// ---------------------------------------------------------------------------
// Contact form schema
// ---------------------------------------------------------------------------

const ContactRequest = z.strictObject({
  name:    userText(1, 100),
  email:   z.string().trim().email().max(254),
  subject: userText(2, 150),
  message: userText(10, 2000),
});

/** @typedef {z.infer<typeof ContactRequest>} ContactRequest */

const CONTACT_FIELD_MESSAGES = {
  name:    'Enter your name (1 to 100 characters).',
  email:   'Enter a valid email address.',
  subject: 'Enter a subject (2 to 150 characters).',
  message: 'Enter your message (10 to 2,000 characters).',
};

/**
 * Validates an untrusted contact-form body.
 * @param {unknown} data
 * @returns {ContactRequest}
 */
export function parseContactRequest(data) {
  const result = ContactRequest.safeParse(data);
  if (result.success) return result.data;
  const fieldErrors = {};
  for (const { path, message } of result.error.issues) {
    const field = String(path[0] ?? 'form');
    fieldErrors[field] ??= CONTACT_FIELD_MESSAGES[field] ?? message;
  }
  throw new HttpError(400, 'INVALID_REQUEST', 'Some fields need fixing.', { fieldErrors });
}

// ---------------------------------------------------------------------------
// Plan form schema
// ---------------------------------------------------------------------------

const FIELD_MESSAGES = {
  eventType: 'Choose a wedding, birthday or community event.',
  candidateName: 'Enter the candidate name(s) (1 to 100 characters).',
  eventDate: `Choose a date between today and ${MAX_YEARS_AHEAD} years from now.`,
  location: 'Enter a city or area (2 to 80 characters).',
  guestCount: `Enter a whole number of guests from 1 to ${MAX_GUESTS.toLocaleString('en')}.`,
  budget: `Enter a whole-number budget from 1 to ${MAX_BUDGET.toLocaleString('en')}.`,
  currency: 'Choose a currency from the list.',
  vibe: 'Keep the style description under 200 characters.',
  priorities: 'Keep priorities under 500 characters.',
  language: 'Choose a language from the list.',
  feedback: 'Describe the change in 3 to 300 characters.',
};

/** @param {Record<string, string>} fieldErrors */
const invalidRequest = (fieldErrors) =>
  new HttpError(400, 'INVALID_REQUEST', 'Some details need fixing.', { fieldErrors });

/**
 * Validates an untrusted request body. Dates are ISO strings, so they compare lexicographically.
 * @param {unknown} data
 * @param {string} today ISO date (YYYY-MM-DD)
 * @returns {PlanRequest}
 */
export function parsePlanRequest(data, today) {
  const result = PlanRequest.safeParse(data);
  const fieldErrors = {};
  for (const { path, message } of result.error?.issues ?? []) {
    const field = String(path[0] ?? 'form');
    fieldErrors[field] ??= FIELD_MESSAGES[field] ?? message;
  }

  // Candidate name is required for weddings and birthdays.
  const candidate = typeof data?.candidateName === 'string' ? data.candidateName.trim() : '';
  if ((data?.eventType === 'wedding' || data?.eventType === 'birthday') && !candidate) {
    fieldErrors.candidateName = FIELD_MESSAGES.candidateName;
  }

  // Checked even when other fields fail, so the user sees every problem at once.
  const latest = `${Number(today.slice(0, 4)) + MAX_YEARS_AHEAD}${today.slice(4)}`;
  const eventDate = data?.eventDate;
  if (typeof eventDate === 'string' && (eventDate < today || eventDate > latest)) {
    fieldErrors.eventDate = FIELD_MESSAGES.eventDate;
  }

  if (Object.keys(fieldErrors).length > 0) throw invalidRequest(fieldErrors);
  return result.data;
}

/**
 * Parses and validates raw model output; anything off-schema is treated as an upstream failure.
 * @param {string} text
 * @returns {GeneratedPlan}
 */
export function parseGeneratedPlan(text) {
  const badResponse = new HttpError(502, 'AI_BAD_RESPONSE', 'The assistant returned an incomplete plan. Please try again.');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw badResponse;
  }
  const result = GeneratedPlan.safeParse(data);
  if (!result.success) throw badResponse;
  return result.data;
}
