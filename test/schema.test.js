import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GENERATED_PLAN_JSON_SCHEMA, parseGeneratedPlan, parsePlanRequest } from '../lib/schema.js';
import { TODAY, validPlan, validRequest } from './fixtures.js';

/** @param {() => unknown} fn */
function fieldErrorsOf(fn) {
  try {
    fn();
  } catch (error) {
    assert.equal(error.status, 400);
    return error.fieldErrors;
  }
  assert.fail('expected a validation error');
}

const withField = (field, value) => ({ ...validRequest(), [field]: value });

describe('parsePlanRequest', () => {
  it('accepts a valid request and applies defaults', () => {
    const request = validRequest();
    delete request.vibe;
    delete request.priorities;
    delete request.language;
    const parsed = parsePlanRequest(request, TODAY);
    assert.deepEqual([parsed.vibe, parsed.priorities, parsed.language], ['', '', 'English']);
  });

  it('trims text and flattens control characters', () => {
    const parsed = parsePlanRequest(withField('location', '  Jaipur\n\u0007City '), TODAY);
    assert.equal(parsed.location, 'Jaipur City');
  });

  const invalid = {
    eventType: 'funeral',
    candidateName: 'x'.repeat(101),
    eventDate: '14/02/2027',
    location: 'x',
    guestCount: 2.5,
    budget: 0,
    currency: 'BTC',
    language: 'Klingon',
    vibe: 'x'.repeat(201),
  };
  for (const [field, value] of Object.entries(invalid)) {
    it(`rejects an invalid ${field} with a readable message`, () => {
      const errors = fieldErrorsOf(() => parsePlanRequest(withField(field, value), TODAY));
      assert.match(errors[field], /\w+/);
    });
  }

  it('requires candidateName for wedding and birthday events', () => {
    const weddingErrors = fieldErrorsOf(() =>
      parsePlanRequest({ ...validRequest(), eventType: 'wedding', candidateName: '' }, TODAY),
    );
    assert.ok(weddingErrors.candidateName);

    const birthdayErrors = fieldErrorsOf(() =>
      parsePlanRequest({ ...validRequest(), eventType: 'birthday', candidateName: '   ' }, TODAY),
    );
    assert.ok(birthdayErrors.candidateName);

    const community = parsePlanRequest(
      { ...validRequest(), eventType: 'community', candidateName: '' },
      TODAY,
    );
    assert.equal(community.candidateName, '');
  });

  it('rejects unknown keys', () => {
    const errors = fieldErrorsOf(() => parsePlanRequest(withField('isAdmin', true), TODAY));
    assert.ok(errors.form);
  });

  it('rejects dates in the past or more than three years ahead', () => {
    for (const eventDate of ['2026-10-19', '2029-10-21']) {
      const errors = fieldErrorsOf(() => parsePlanRequest(withField('eventDate', eventDate), TODAY));
      assert.ok(errors.eventDate);
    }
    assert.equal(parsePlanRequest(withField('eventDate', TODAY), TODAY).eventDate, TODAY);
  });

  it('reports a date outside the window alongside other field errors', () => {
    const errors = fieldErrorsOf(() =>
      parsePlanRequest({ ...validRequest(), eventDate: '2020-01-01', guestCount: 0 }, TODAY),
    );
    assert.deepEqual(Object.keys(errors).sort(), ['eventDate', 'guestCount']);
  });

  it('requires feedback and previousPlan together', () => {
    const errors = fieldErrorsOf(() => parsePlanRequest(withField('feedback', 'Cheaper please'), TODAY));
    assert.ok(errors.feedback);
    const refined = parsePlanRequest({ ...withField('feedback', 'Cheaper please'), previousPlan: validPlan() }, TODAY);
    assert.equal(refined.feedback, 'Cheaper please');
  });
});

describe('parseGeneratedPlan', () => {
  it('accepts schema-conformant model output', () => {
    assert.deepEqual(parseGeneratedPlan(JSON.stringify(validPlan())), validPlan());
  });

  const badOutputs = {
    'non-JSON text': 'Sure! Here is your plan',
    'a plan missing a section': JSON.stringify({ ...validPlan(), vendors: undefined }),
    'an unknown idea area': JSON.stringify({
      ...validPlan(),
      ideas: validPlan().ideas.map((idea) => ({ ...idea, area: 'misc' })),
    }),
  };
  for (const [label, text] of Object.entries(badOutputs)) {
    it(`treats ${label} as a bad upstream response`, () => {
      assert.throws(() => parseGeneratedPlan(text), { status: 502, code: 'AI_BAD_RESPONSE' });
    });
  }
});

it('exports a Gemini-compatible JSON schema', () => {
  assert.equal(GENERATED_PLAN_JSON_SCHEMA.$schema, undefined);
  assert.deepEqual(GENERATED_PLAN_JSON_SCHEMA.required, ['summary', 'budget', 'timeline', 'vendors', 'ideas']);
});
