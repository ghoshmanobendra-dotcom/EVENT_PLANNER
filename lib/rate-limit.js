/**
 * Fixed-window request limiter keyed by client identifier.
 * @param {{ limit: number, windowMs: number, maxKeys?: number, now?: () => number }} options
 */
export function createRateLimiter({ limit, windowMs, maxKeys = 10_000, now = Date.now }) {
  /** @type {Map<string, { count: number, resetAt: number }>} */
  const windows = new Map();

  /** @param {number} time */
  function pruneExpired(time) {
    for (const [key, window] of windows) {
      if (time >= window.resetAt) windows.delete(key);
    }
  }

  /**
   * @param {string} key
   * @returns {{ allowed: boolean, retryAfterSeconds: number }}
   */
  return function hit(key) {
    const time = now();
    let window = windows.get(key);
    if (!window || time >= window.resetAt) {
      if (windows.size >= maxKeys) pruneExpired(time);
      window = { count: 0, resetAt: time + windowMs };
      windows.set(key, window);
    }
    window.count += 1;
    return {
      allowed: window.count <= limit,
      retryAfterSeconds: Math.ceil((window.resetAt - time) / 1000),
    };
  };
}
