/**
 * The five GitHub-alert kinds, shared by the native callout decoration and the
 * native↔managed promotion path (docs/design/SMART-BLOCKS.md, "Native patterns"). A callout is
 * native as a `> [!NOTE]` blockquote and managed as an `omd:<kind>` container carrying
 * parameters the bare alert can't hold (e.g. a custom title). One source of truth so the
 * two representations can convert into each other without drift.
 *
 * The five accents are the only hardcoded colors OMD's chrome is allowed (docs/design/STYLE.md).
 */
export interface CalloutKind {
  label: string;
  accent: string;
  icon: string;
}

export const CALLOUT_KINDS: Record<string, CalloutKind> = {
  note: { label: 'Note', accent: '#58a6ff', icon: 'info' },
  tip: { label: 'Tip', accent: '#3fb950', icon: 'light-bulb' },
  important: { label: 'Important', accent: '#a371f7', icon: 'megaphone' },
  warning: { label: 'Warning', accent: '#d29922', icon: 'warning' },
  caution: { label: 'Caution', accent: '#f85149', icon: 'error' }
};

/** Matches an alert marker at the start of a callout's first line: `[!NOTE]`. */
export const CALLOUT_MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/;

export function isCalloutKind(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(CALLOUT_KINDS, name);
}
