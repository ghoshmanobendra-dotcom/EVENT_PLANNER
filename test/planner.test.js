import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { allocateBudget, enrichPlan, scheduleByWeeks, toIsoDate } from '../lib/planner.js';
import { TODAY, validPlan } from './fixtures.js';

const sum = (items) => items.reduce((total, item) => total + item.amount, 0);

describe('allocateBudget', () => {
  it('sums exactly to the total when shares do not divide evenly', () => {
    const items = [{ weight: 1 }, { weight: 1 }, { weight: 1 }];
    for (const total of [1, 2, 100, 1001, 999_999_999]) {
      assert.equal(sum(allocateBudget(items, total)), total);
    }
  });

  it('normalises weights that do not add up to 100', () => {
    const [first, second] = allocateBudget([{ weight: 30 }, { weight: 10 }], 1000);
    assert.deepEqual([first.amount, second.amount], [750, 250]);
    assert.deepEqual([first.percent, second.percent], [75, 25]);
  });

  it('gives the leftover units to the largest remainders', () => {
    const amounts = allocateBudget([{ weight: 50 }, { weight: 30 }, { weight: 20 }], 7).map((item) => item.amount);
    assert.deepEqual(amounts, [4, 2, 1]);
  });

  it('keeps the original item fields', () => {
    const [item] = allocateBudget([{ category: 'Venue', weight: 1, tip: 'x' }], 10);
    assert.equal(item.category, 'Venue');
    assert.equal(item.tip, 'x');
  });
});

describe('scheduleByWeeks', () => {
  it('counts weeks back from the event and sorts soonest first', () => {
    const [first, second] = scheduleByWeeks([{ weeksBefore: 0 }, { weeksBefore: 2 }], '2026-12-31', TODAY);
    assert.deepEqual([first.dueDate, second.dueDate], ['2026-12-17', '2026-12-31']);
    assert.equal(first.compressed, false);
  });

  it('pulls overdue items forward to today and flags them', () => {
    const [item] = scheduleByWeeks([{ weeksBefore: 10 }], '2026-11-01', TODAY);
    assert.equal(item.dueDate, TODAY);
    assert.equal(item.compressed, true);
  });
});

describe('enrichPlan', () => {
  it('adds amounts and dates without dropping model content', () => {
    const plan = enrichPlan(validPlan(), { budget: 1_500_000, eventDate: '2027-02-14', today: TODAY });
    assert.equal(sum(plan.budget), 1_500_000);
    assert.ok(plan.timeline.every((task) => /^\d{4}-\d{2}-\d{2}$/.test(task.dueDate)));
    assert.ok(plan.vendors.every((vendor) => vendor.dueDate <= '2027-02-14'));
    assert.equal(plan.ideas.length, validPlan().ideas.length);
  });
});

it('toIsoDate formats in UTC', () => {
  assert.equal(toIsoDate(Date.UTC(2026, 0, 5, 23, 59)), '2026-01-05');
});
