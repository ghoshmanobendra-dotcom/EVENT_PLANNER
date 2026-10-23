import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createContactHandler } from '../api/contact.js';

/** @returns {import('../lib/schema.js').ContactRequest} */
const validContact = () => ({
  name:    'Priya Sharma',
  email:   'priya@example.com',
  subject: 'Question about my plan',
  message: 'I would like to know how to refine my wedding plan further.',
});

/**
 * @param {unknown} body
 * @param {Record<string, string>} [headers]
 */
function post(body, headers = {}) {
  return new Request('http://localhost/api/contact', {
    method:  'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7', ...headers },
    body:    typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** @param {(fields: import('../lib/schema.js').ContactRequest) => Promise<void>} [sendEmail] */
function setup(sendEmail = async () => {}) {
  /** @type {import('../lib/schema.js').ContactRequest[]} */
  const sent = [];
  const handler = createContactHandler({
    now: () => 0,
    sendEmail: async (fields) => {
      sent.push(fields);
      return sendEmail(fields);
    },
  });
  return { handler, sent };
}

describe('POST /api/contact', () => {
  it('returns 200 and calls sendEmail for a valid submission', async () => {
    const { handler, sent } = setup();
    const response = await handler(post(validContact()));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].name, validContact().name);
    assert.equal(sent[0].email, validContact().email);
  });

  it('returns 400 with per-field errors for invalid input', async () => {
    const { handler, sent } = setup();
    const response = await handler(post({ ...validContact(), email: 'not-an-email', message: 'short' }));
    assert.equal(response.status, 400);
    const { error } = await response.json();
    assert.equal(error.code, 'INVALID_REQUEST');
    assert.ok(error.fieldErrors.email, 'should report bad email');
    assert.ok(error.fieldErrors.message, 'should report short message');
    assert.equal(sent.length, 0, 'sendEmail must not be called on invalid input');
  });

  it('returns 400 and rejects unknown fields (strictObject)', async () => {
    const { handler } = setup();
    const response = await handler(post({ ...validContact(), injected: 'evil' }));
    assert.equal(response.status, 400);
    const { error } = await response.json();
    assert.equal(error.code, 'INVALID_REQUEST');
  });

  it('returns 413 for oversized bodies', async () => {
    const { handler } = setup();
    const response = await handler(post({ ...validContact(), message: 'x'.repeat(40_000) }));
    assert.equal(response.status, 413);
  });

  it('rate limits a single client and advertises retry-after', async () => {
    const { handler } = setup();
    for (let i = 1; i <= 5; i += 1) await handler(post(validContact()));
    const response = await handler(post(validContact()));
    assert.equal(response.status, 429);
    assert.ok(response.headers.get('retry-after'), 'should include retry-after header');
    const { error } = await response.json();
    assert.equal(error.code, 'RATE_LIMITED');
  });

  it('hides sendEmail failures behind a generic 500', async () => {
    const crashingSend = async () => { throw new TypeError('Resend secret detail'); };
    const { handler } = setup(crashingSend);
    const response = await handler(post(validContact()));
    assert.equal(response.status, 500);
    const text = await response.text();
    assert.doesNotMatch(text, /Resend secret detail/);
    const { error } = JSON.parse(text);
    assert.equal(error.code, 'INTERNAL');
  });

  it('rejects non-JSON content types with 415', async () => {
    const { handler } = setup();
    const response = await handler(post(validContact(), { 'content-type': 'text/plain' }));
    assert.equal(response.status, 415);
  });
});
