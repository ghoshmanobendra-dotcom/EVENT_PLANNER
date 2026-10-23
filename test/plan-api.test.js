import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPlanHandler } from '../api/plan.js';
import { HttpError } from '../lib/http.js';
import { validPlan, validRequest } from './fixtures.js';

const NOW = Date.UTC(2026, 9, 20);

function post(body, headers = {}) {
  return new Request('http://localhost/api/plan', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function setup(generate = async () => JSON.stringify(validPlan())) {
  const calls = [];
  const handler = createPlanHandler({
    now: () => NOW,
    generate: async (prompt) => {
      calls.push(prompt);
      return generate(prompt);
    },
  });
  return { handler, calls };
}

const failWith = (error) => async () => {
  throw error;
};

describe('POST /api/plan', () => {
  it('returns an enriched plan whose budget matches the request exactly', async () => {
    const response = await setup().handler(post(validRequest()));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const { plan } = await response.json();
    assert.equal(plan.budget.reduce((sum, item) => sum + item.amount, 0), validRequest().budget);
    assert.ok(plan.timeline[0].dueDate);
  });

  it('serves repeated identical requests from cache', async () => {
    const { handler, calls } = setup();
    await handler(post(validRequest()));
    assert.equal((await handler(post(validRequest()))).status, 200);
    assert.equal(calls.length, 1);
  });

  it('returns field errors for invalid input without calling the model', async () => {
    const { handler, calls } = setup();
    const response = await handler(post({ ...validRequest(), guestCount: 0 }));
    assert.equal(response.status, 400);
    const { error } = await response.json();
    assert.equal(error.code, 'INVALID_REQUEST');
    assert.ok(error.fieldErrors.guestCount);
    assert.equal(calls.length, 0);
  });

  it('rejects malformed JSON, wrong content types and oversized bodies', async () => {
    const { handler } = setup();
    assert.equal((await handler(post('{nope'))).status, 400);
    assert.equal((await handler(post(validRequest(), { 'content-type': 'text/plain' }))).status, 415);
    assert.equal((await handler(post({ ...validRequest(), vibe: 'x'.repeat(40_000) }))).status, 413);
  });

  it('rate limits a single client and says when to retry', async () => {
    const { handler } = setup();
    let response;
    for (let i = 1; i <= 11; i += 1) response = await handler(post({ ...validRequest(), guestCount: i }));
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '60');
  });

  it('maps bad model output to 502 and passes upstream HTTP errors through', async () => {
    assert.equal((await setup(async () => 'not json').handler(post(validRequest()))).status, 502);
    const response = await setup(failWith(new HttpError(504, 'AI_TIMEOUT', 'slow'))).handler(post(validRequest()));
    assert.equal(response.status, 504);
    assert.equal((await response.json()).error.code, 'AI_TIMEOUT');
  });

  it('hides unexpected errors behind a generic 500', async () => {
    const response = await setup(failWith(new TypeError('secret detail'))).handler(post(validRequest()));
    assert.equal(response.status, 500);
    assert.doesNotMatch(await response.text(), /secret detail/);
  });
});
