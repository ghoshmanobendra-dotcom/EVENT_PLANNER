import assert from 'node:assert/strict';
import { it } from 'node:test';
import { createLruCache } from '../lib/cache.js';

it('evicts the least recently used entry when full', () => {
  const cache = createLruCache({ max: 2, ttlMs: 1000, now: () => 0 });
  cache.set('a', 1);
  cache.set('b', 2);
  cache.get('a');
  cache.set('c', 3);
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.get('a'), 1);
  assert.equal(cache.get('c'), 3);
});

it('expires entries after the TTL', () => {
  let time = 0;
  const cache = createLruCache({ max: 5, ttlMs: 100, now: () => time });
  cache.set('a', 1);
  time = 99;
  assert.equal(cache.get('a'), 1);
  time = 100;
  assert.equal(cache.get('a'), undefined);
});
