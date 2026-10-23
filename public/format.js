const DAY_MS = 24 * 60 * 60 * 1000;

/** @param {number} amount @param {string} currency @param {string} [locale] */
export const formatMoney = (amount, currency, locale) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);

/**
 * Dates are calendar days, so they are parsed and printed in UTC to avoid
 * shifting by a day in timezones west of Greenwich.
 * @param {string} isoDate @param {Intl.DateTimeFormatOptions} [options] @param {string} [locale]
 */
export const formatDate = (isoDate, options = { day: 'numeric', month: 'short', year: 'numeric' }, locale) =>
  new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(Date.parse(isoDate));

/** @param {string} isoDate */
export const formatMonth = (isoDate, locale) => formatDate(isoDate, { month: 'long', year: 'numeric' }, locale);

/** @param {string} eventDate @param {string} today Both ISO dates. */
export const daysBetween = (today, eventDate) => Math.round((Date.parse(eventDate) - Date.parse(today)) / DAY_MS);

/** Today's calendar date in the viewer's own timezone, as YYYY-MM-DD. */
export function localIsoDate(date = new Date()) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

/**
 * Groups already-sorted items by calendar month, preserving order.
 * @template {{ dueDate: string }} T
 * @param {T[]} items
 * @returns {[string, T[]][]} Month key (YYYY-MM) with its items.
 */
export function groupByMonth(items) {
  const groups = new Map();
  for (const item of items) {
    const month = item.dueDate.slice(0, 7);
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month).push(item);
  }
  return [...groups];
}
