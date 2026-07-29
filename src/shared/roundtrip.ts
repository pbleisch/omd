/**
 * Round-trip comparison. Principle 2 ("open then save with no edit reproduces the
 * file") is asserted "after whitespace normalization" (docs/design/FORMATS.md). This is the
 * one place that defines what "identical after whitespace normalization" means, so
 * the host's loop guard and the round-trip test suite agree byte-for-byte.
 */

/** A GFM table delimiter row: only pipes, colons, dashes, spaces, and at least one dash. */
const DELIMITER_ROW = /^\s*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

/**
 * Canonicalize a table delimiter row to a fixed dash count, preserving alignment
 * colons. remark-gfm sizes delimiter dashes to the column's content width, so a
 * hand-authored `| --- |` re-serializes as `| - |`. Making the comparison dash-count-
 * agnostic means the host's loop guard sees no change and never rewrites the file — so
 * the user's original bytes survive on disk untouched (Principle 2).
 */
function canonicalizeDelimiterRows(text: string): string {
  return text
    .split('\n')
    .map((line) => (DELIMITER_ROW.test(line) ? line.replace(/-+/g, '---') : line))
    .join('\n');
}

/** A table row: begins (after optional indent) with a pipe. */
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const FENCE = /^\s*(```|~~~)/;

/**
 * Collapse interior cell padding in table rows to a single space. remark-gfm pads
 * cells to the column's content width for visual alignment, so a compact hand-authored
 * table re-serializes wider. Making the comparison padding-agnostic (like the delimiter
 * dashes) means the host never rewrites an untouched table. Fence-aware so a `|` inside
 * a code block is never touched.
 */
function canonicalizeTablePadding(text: string): string {
  let inFence = false;
  return text
    .split('\n')
    .map((line) => {
      if (FENCE.test(line)) inFence = !inFence;
      if (inFence || !TABLE_ROW.test(line)) return line;
      return line.replace(/ {2,}/g, ' ').replace(/\|\s+/g, '| ').replace(/\s+\|/g, ' |');
    })
    .join('\n');
}

/** Normalize trailing whitespace and final-newline noise without touching content. */
export function normalizeMarkdown(text: string): string {
  return canonicalizeTablePadding(
    canonicalizeDelimiterRows(
      text
        .replace(/\r\n/g, '\n') // CRLF -> LF
        .replace(/[ \t]+$/gm, '') // strip trailing spaces on each line
        .replace(/\n{3,}/g, '\n\n') // collapse 3+ blank lines to one blank line
        .replace(/\s+$/, '') // strip trailing blank lines at EOF
    )
  ).concat('\n'); // exactly one final newline
}

/** True when two markdown strings are equal after whitespace normalization. */
export function roundTripEqual(a: string, b: string): boolean {
  return normalizeMarkdown(a) === normalizeMarkdown(b);
}
