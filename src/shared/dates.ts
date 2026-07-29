/**
 * Date helpers shared by the host (template scaffolding) and the editor (the `date` block).
 * Deliberately local-time, not UTC, so "today" means the user's today.
 */

/** Local-time ISO date (`YYYY-MM-DD`). */
export function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
