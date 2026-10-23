/**
 * Small LRU cache with per-entry expiry. A Map keeps insertion order, so the
 * first key is always the least recently used one.
 * @template T
 * @param {{ max: number, ttlMs: number, now?: () => number }} options
 */
export function createLruCache({ max, ttlMs, now = Date.now }) {
  /** @type {Map<string, { value: T, expiresAt: number }>} */
  const entries = new Map();

  return {
    /** @param {string} key @returns {T | undefined} */
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      entries.delete(key);
      if (now() >= entry.expiresAt) return undefined;
      entries.set(key, entry);
      return entry.value;
    },

    /** @param {string} key @param {T} value */
    set(key, value) {
      entries.delete(key);
      entries.set(key, { value, expiresAt: now() + ttlMs });
      if (entries.size > max) entries.delete(entries.keys().next().value);
    },
  };
}
