/**
 * The shortcode contract — the one place host and editor agree on the bytes a smart
 * block occupies on disk (docs/design/FORMATS.md). Everything here is pure and string-only so
 * both processes import it and can never drift.
 *
 * Two forms:
 *   Leaf       <!-- omd:date {"value":"2026-01-02"} -->
 *   Container  <!-- omd:collapsible {"summary":"Details"} -->
 *              …real markdown body…
 *              <!-- /omd:collapsible -->
 *
 * Params are always a JSON object, present even when empty (`{}`). A leaf and a container
 * opener are syntactically identical — an opener is simply an `omd:` tag that has a
 * matching close among its siblings; an unclosed opener is a leaf.
 */

/** A block name: lowercase, digits, dashes — the block's identity in the shortcode. */
const NAME = '[a-z0-9][a-z0-9-]*';

/** `<!-- omd:name {json} -->` — matches a leaf or a container opener. */
const OPEN_RE = new RegExp(`^<!--\\s*omd:(${NAME})\\s+(\\{[\\s\\S]*\\})\\s*-->$`);
/** `<!-- /omd:name -->` — matches a container close. */
const CLOSE_RE = new RegExp(`^<!--\\s*/omd:(${NAME})\\s*-->$`);

export interface OpenTag {
  name: string;
  /** The raw JSON params substring, preserved verbatim for byte-faithful round-trip. */
  params: string;
}

/** Parse an `omd:` opener/leaf comment; null if the html is not one. */
export function matchOpen(html: string): OpenTag | null {
  const m = OPEN_RE.exec(html.trim());
  if (!m) return null;
  return { name: m[1], params: m[2] };
}

/** Parse an `omd:` close comment; null if the html is not one. */
export function matchClose(html: string): { name: string } | null {
  const m = CLOSE_RE.exec(html.trim());
  if (!m) return null;
  return { name: m[1] };
}

/** True if the html is any OMD shortcode delimiter (opener, leaf, or close). */
export function isShortcode(html: string): boolean {
  return matchOpen(html) !== null || matchClose(html) !== null;
}

/** Build an opener/leaf tag. `params` is a raw JSON string (use {@link stringifyParams}). */
export function buildOpen(name: string, params: string): string {
  return `<!-- omd:${name} ${params} -->`;
}

/** Build a container close tag. */
export function buildClose(name: string): string {
  return `<!-- /omd:${name} -->`;
}

/** Parse a raw params string to an object; `{}` on anything unparseable. */
export function parseParams(params: string): Record<string, unknown> {
  try {
    const obj = JSON.parse(params) as unknown;
    return obj && typeof obj === 'object' ? (obj as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Canonical params serialization used when OMD writes a shortcode (insert / edit). */
export function stringifyParams(obj: Record<string, unknown>): string {
  return JSON.stringify(obj ?? {});
}
