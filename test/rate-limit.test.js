import assert from 'node:assert/strict';
import { it } from 'node:test';
import { createRateLimiter } from '../lib/rate-limit.js';

it('blocks after the limit and resets with the window', () => {
  let time = 0;
  const hit = createRateLimiter({ limit: 2, windowMs: 1000, now: () => time });
  assert.equal(hit('ip').allowed, true);
  assert.equal(hit('ip').allowed, true);
  assert.deepEqual(hit('ip'), { allowed: false, retryAfterSeconds: 1 });
  assert.equal(hit('other').allowed, true);
  time = 1000;
  assert.equal(hit('ip').allowed, true);
});

it('prunes expired windows once the key cap is reached', () => {
  let time = 0;
  const hit = createRateLimiter({ limit: 1, windowMs: 10, maxKeys: 2, now: () => time });
  hit('a');
  hit('b');
  time = 10;
  hit('c');
  time = 15;
  assert.equal(hit('c').allowed, false);
  assert.equal(hit('a').allowed, true);
});
