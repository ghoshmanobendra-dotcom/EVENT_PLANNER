const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_PER_WEEK = 7;

/** @param {number | Date} time @returns {string} ISO date (YYYY-MM-DD) in UTC */
export const toIsoDate = (time) => new Date(time).toISOString().slice(0, 10);

/**
 * Turns the model's relative weights into currency amounts that add up to
 * exactly `total`, using largest-remainder rounding on whole units.
 * @template {{ weight: number }} T
 * @param {T[]} items
 * @param {number} total Whole currency units.
 * @returns {(T & { amount: number, percent: number })[]}
 */
export function allocateBudget(items, total) {
  const weightSum = items.reduce((sum, item) => sum + item.weight, 0);
  const exact = items.map((item) => (total * item.weight) / weightSum);
  const amounts = exact.map(Math.floor);

  let leftover = total - amounts.reduce((sum, amount) => sum + amount, 0);
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - amounts[index] }))
    .sort((a, b) => b.remainder - a.remainder);
  for (const { index } of byRemainder) {
    if (leftover === 0) break;
    amounts[index] += 1;
    leftover -= 1;
  }

  return items.map((item, index) => ({
    ...item,
    amount: amounts[index],
    percent: Math.round((item.weight / weightSum) * 1000) / 10,
  }));
}

/**
 * Converts "weeks before the event" into calendar dates, sorted soonest first.
 * Anything that would already be overdue is pulled forward to today and flagged.
 * @template {{ weeksBefore: number }} T
 * @param {T[]} items
 * @param {string} eventDate ISO date
 * @param {string} today ISO date
 * @returns {(T & { dueDate: string, compressed: boolean })[]}
 */
export function scheduleByWeeks(items, eventDate, today) {
  const eventTime = Date.parse(eventDate);
  return items
    .map((item) => {
      const ideal = toIsoDate(eventTime - item.weeksBefore * DAYS_PER_WEEK * DAY_MS);
      const compressed = ideal < today;
      return { ...item, dueDate: compressed ? today : ideal, compressed };
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/**
 * Adds the deterministic numbers the model is not trusted to compute.
 * @param {import('./schema.js').GeneratedPlan} plan
 * @param {{ budget: number, eventDate: string, today: string }} context
 */
export function enrichPlan(plan, { budget, eventDate, today }) {
  return {
    ...plan,
    budget: allocateBudget(plan.budget, budget),
    timeline: scheduleByWeeks(plan.timeline, eventDate, today),
    vendors: scheduleByWeeks(plan.vendors, eventDate, today),
  };
}
