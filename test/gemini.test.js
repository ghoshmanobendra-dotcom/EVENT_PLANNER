import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { generatePlan } from '../lib/gemini.js';

const PROMPT = { systemInstruction: 'system', contents: 'plan please' };

const geminiReply = (text) =>
  Response.json({ candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }] });

const geminiError = (status) =>
  Response.json({ error: { code: status, message: 'upstream', status: 'UNAVAILABLE' } }, { status });

/** Mocks the network so the real SDK request and error handling run. */
function mockFetch(...responses) {
  const queue = [...responses];
  return mock.method(globalThis, 'fetch', async () => {
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return next;
  });
}

describe('generatePlan', () => {
  afterEach(() => mock.restoreAll());

  it('refuses to call the API when no key is configured', async () => {
    const key = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const fetch = mockFetch();
    await assert.rejects(generatePlan(PROMPT), { status: 503, code: 'AI_NOT_CONFIGURED' });
    assert.equal(fetch.mock.callCount(), 0);
    if (key !== undefined) process.env.GEMINI_API_KEY = key;
  });

  describe('with a key', () => {
    before(() => {
      process.env.GEMINI_API_KEY ??= 'test-key';
    });

    it('returns the model text and sends the structured-output config', async () => {
      const fetch = mockFetch(geminiReply('{"ok":true}'));
      assert.equal(await generatePlan(PROMPT), '{"ok":true}');
      const body = JSON.parse(fetch.mock.calls[0].arguments[1].body);
      assert.equal(body.generationConfig.responseMimeType, 'application/json');
      assert.ok(body.generationConfig.responseJsonSchema.properties.budget);
    });

    it('retries a transient failure exactly once', async () => {
      const fetch = mockFetch(geminiError(503), geminiReply('{"ok":true}'));
      assert.equal(await generatePlan(PROMPT), '{"ok":true}');
      assert.equal(fetch.mock.callCount(), 2);
    });

    it('does not retry a client error and reports the assistant as unavailable', async () => {
      const fetch = mockFetch(geminiError(400));
      await assert.rejects(generatePlan(PROMPT), { status: 502, code: 'AI_UNAVAILABLE' });
      assert.equal(fetch.mock.callCount(), 1);
    });

    // The SDK wraps our signal in its own controller, so a real timeout surfaces as AbortError.
    it('maps a timeout to 504', async () => {
      for (const name of ['AbortError', 'TimeoutError']) {
        mockFetch(new DOMException('The operation was aborted.', name));
        await assert.rejects(generatePlan(PROMPT), { status: 504, code: 'AI_TIMEOUT' });
      }
    });

    it('shares one deadline across the retry', async () => {
      const timeout = mock.method(AbortSignal, 'timeout');
      mockFetch(geminiError(503), geminiReply('{"ok":true}'));
      await generatePlan(PROMPT);
      assert.equal(timeout.mock.callCount(), 1);
    });
  });
});
