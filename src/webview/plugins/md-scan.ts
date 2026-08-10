/**
 * Line- and span-level markdown scanning shared by the post-serialize passes
 * (`serialize-fixups.ts`, `relax-escapes.ts`). Both need the same answer to one
 * question — *is this position code, or is it prose?* — and a fixup that gets that
 * wrong rewrites a backslash the writer typed (#31).
 */

/** A fence opener/closer: up to three spaces of indent, then a run of 3+ backticks or tildes. */
export const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})/;
/** A fence closer carries nothing but the marker run (an info string is opener-only). */
export const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
/** A GFM table row: begins (after optional indent) with a pipe and ends with one. */
export const TABLE_ROW = /^\s*\|.*\|\s*$/;

/** ASCII punctuation — the only characters a markdown backslash escape can precede. */
export const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/;

/**
 * The `[start, end)` ranges of `text` covered by inline code spans, delimiters included.
 *
 * CommonMark's rule: a run of N backticks opens a span that the next run of exactly N
 * backticks closes; a run with no matching closer is literal text. A backslash-escaped
 * backtick (`` \` `` — how the serializer emits a literal one) never opens a span, but
 * backslashes are *not* escapes inside a span, so the closer search reads them literally.
 */
export function codeSpanRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2;
      continue;
    }
    if (text[i] !== '`') {
      i += 1;
      continue;
    }
    const openStart = i;
    while (text[i] === '`') i += 1;
    const width = i - openStart;

    let j = i;
    let closeEnd = -1;
    while (j < text.length) {
      if (text[j] !== '`') {
        j += 1;
        continue;
      }
      const runStart = j;
      while (text[j] === '`') j += 1;
      if (j - runStart === width) {
        closeEnd = j;
        break;
      }
    }
    if (closeEnd === -1) continue; // an unmatched run: literal text, keep scanning after it
    ranges.push([openStart, closeEnd]);
    i = closeEnd;
  }
  return ranges;
}
