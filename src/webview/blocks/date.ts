/**
 * The `date` built-in block. Its on-disk form is the *bare token* `📅 YYYY-MM-DD`
 * (docs/design/FORMATS.md) — native GFM that reads correctly anywhere, decorated by OMD rather than
 * wrapped in machinery. Relative input (`today`, `+7d`) is resolved to a concrete date at
 * insert time, so the file never stores something whose meaning drifts with the calendar.
 */

import { toIsoDate } from '../../shared/dates';
export { toIsoDate };

/** Matches a bare date token; `g` for scanning text, so callers must reset `lastIndex`. */
export const DATE_TOKEN = /📅 (\d{4}-\d{2}-\d{2})/g;

export function formatDateToken(iso: string): string {
  return `📅 ${iso}`;
}

const UNIT_DAYS: Record<string, number> = { d: 1, w: 7 };

/**
 * Resolve a date input to `YYYY-MM-DD`, or null if it isn't a date.
 * Accepts: empty/`today`, `tomorrow`, `yesterday`, relative `+7d` / `-2w` / `+3m` / `+1y`,
 * and an explicit ISO date.
 */
export function resolveDateInput(input: string, now: Date = new Date()): string | null {
  const s = input.trim().toLowerCase();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (s === '' || s === 'today') return toIsoDate(base);
  if (s === 'tomorrow') return toIsoDate(new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1));
  if (s === 'yesterday') return toIsoDate(new Date(base.getFullYear(), base.getMonth(), base.getDate() - 1));

  const rel = /^([+-])(\d+)\s*([dwmy])$/.exec(s);
  if (rel) {
    const sign = rel[1] === '-' ? -1 : 1;
    const n = sign * Number(rel[2]);
    const unit = rel[3];
    if (unit === 'm') return toIsoDate(new Date(base.getFullYear(), base.getMonth() + n, base.getDate()));
    if (unit === 'y') return toIsoDate(new Date(base.getFullYear() + n, base.getMonth(), base.getDate()));
    return toIsoDate(new Date(base.getFullYear(), base.getMonth(), base.getDate() + n * UNIT_DAYS[unit]));
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) {
    const [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    const date = new Date(y, m - 1, d);
    // Reject impossible dates like 2026-02-31, which Date would silently roll over.
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
    return toIsoDate(date);
  }
  return null;
}
