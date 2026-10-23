import assert from 'node:assert/strict';
import { it } from 'node:test';
import { daysBetween, formatDate, formatMoney, groupByMonth, localIsoDate } from '../public/format.js';

it('formats money without decimals in the chosen currency', () => {
  assert.equal(formatMoney(1500000, 'INR', 'en-IN'), '₹15,00,000');
  assert.equal(formatMoney(2500, 'USD', 'en-US'), '$2,500');
});

it('formats calendar dates without timezone drift', () => {
  assert.equal(formatDate('2027-02-14', undefined, 'en-GB'), '14 Feb 2027');
});

it('counts whole days between ISO dates', () => {
  assert.equal(daysBetween('2026-10-20', '2027-02-14'), 117);
  assert.equal(daysBetween('2026-10-20', '2026-10-20'), 0);
});

it('returns the local calendar date as YYYY-MM-DD', () => {
  assert.match(localIsoDate(), /^\d{4}-\d{2}-\d{2}$/);
});

it('groups sorted items by month in order', () => {
  const groups = groupByMonth([{ dueDate: '2026-11-02' }, { dueDate: '2026-11-20' }, { dueDate: '2027-01-05' }]);
  assert.deepEqual(groups.map(([month, items]) => [month, items.length]), [['2026-11', 2], ['2027-01', 1]]);
});
