/**
 * Drop the escapes remark added that this document does not need (#37).
 *
 * `mdast-util-to-markdown` escapes a character whenever it *could* begin a construct,
 * judged from one text node and one character of lookahead. That is the only judgement it
 * can make, and it is deliberately pessimistic: `~430 ms` comes back `\~430 ms`,
 * `## [Unreleased]` comes back `## \[Unreleased]`, and a literal ```` ``` ```` in prose
 * comes back `` \`\`\` ``. All three render identically on GitHub, and all three make a
 * file the writer never touched diff-dirty on save — which Principle 2 says is a bug.
 *
 * The whole document is available here, so the pessimism is unnecessary. This pass looks
 * at the *container* an escape sits in — a paragraph-sized run of lines, or a single table
 * cell, since GFM splits cells before it parses their inlines — and removes an escape only
 * when the construct it guards against provably cannot form there. Everything it cannot
 * prove, it leaves escaped.
 *
 * Nothing inside a fenced block or an inline code span is touched: there a backslash is
 * content the writer typed (#31).
 */

import { ASCII_PUNCTUATION, codeSpanRanges, FENCE_CLOSE, FENCE_LINE, TABLE_ROW } from './md-scan';

/** The characters whose escape this pass may remove. */
const RELAXABLE = new Set(['~', '`', '[', '(']);

/** Every character `RELAXABLE` covers, as an escape, for the cheap "is there anything to do" test. */
const ANY_RELAXABLE_ESCAPE = /\\[~`[(]/;

/**
 * A container with every backslash escape resolved, so the analysis reads the text the way
 * a parser will once the escapes are gone.
 *
 * `escaped[i]` records that `text[i]` was written as `\c`; `origin[i]` is where `text[i]`
 * sits in the raw container, so an approved escape can be deleted by its backslash's index.
 */
interface Logical {
  text: string;
  escaped: boolean[];
  origin: number[];
  /** True where the character is inside an inline code span, delimiters included. */
  code: boolean[];
}

function toLogical(raw: string): Logical {
  const span = new Array<boolean>(raw.length).fill(false);
  for (const [start, end] of codeSpanRanges(raw)) span.fill(true, start, end);
  const inSpan = (index: number) => span[index];

  const text: string[] = [];
  const escaped: boolean[] = [];
  const origin: number[] = [];
  const code: boolean[] = [];

  for (let i = 0; i < raw.length; i += 1) {
    const isEscape =
      raw[i] === '\\' &&
      i + 1 < raw.length &&
      ASCII_PUNCTUATION.test(raw[i + 1]) &&
      // Backslashes are literal inside a code span, never escapes.
      !inSpan(i);
    if (isEscape) {
      text.push(raw[i + 1]);
      escaped.push(true);
      origin.push(i + 1);
      code.push(false);
      i += 1;
    } else {
      text.push(raw[i]);
      escaped.push(false);
      origin.push(i);
      code.push(inSpan(i));
    }
  }
  return { text: text.join(''), escaped, origin, code };
}

/**
 * One inline container: a paragraph-sized run of lines, or a single table cell. `inlineOnly`
 * marks the cell case, where no block-level construct can form however the bytes read.
 */
interface Container {
  logical: Logical;
  inlineOnly: boolean;
  documentHasDefinitions: boolean;
}

/** A maximal run of one character, and whether every character in it was escaped. */
interface Run {
  start: number;
  length: number;
  allEscaped: boolean;
  inCode: boolean;
}

function runsOf(logical: Logical, character: string): Run[] {
  const runs: Run[] = [];
  let i = 0;
  while (i < logical.text.length) {
    if (logical.text[i] !== character) {
      i += 1;
      continue;
    }
    const start = i;
    let allEscaped = true;
    let inCode = false;
    while (logical.text[i] === character) {
      allEscaped &&= logical.escaped[i];
      inCode ||= logical.code[i];
      i += 1;
    }
    runs.push({ start, length: i - start, allEscaped, inCode });
  }
  return runs;
}

/**
 * True when nothing but blockquote markers, a list marker, and spaces precede `index` on
 * its line. A construct that only exists at the start of a line — a fence, a link
 * definition, a task-list checkbox — can be created by unescaping there, so this pass
 * never does.
 */
function atLineStart(container: Container, index: number): boolean {
  // A table cell holds inline content only: no block construct can start inside one, so
  // nothing in a cell is "at the start of a line".
  if (container.inlineOnly) return false;
  const text = container.logical.text;
  const prefix = text.slice(text.lastIndexOf('\n', index - 1) + 1, index);
  return /^[\s>]*$/.test(prefix) || /^[\s>]*(?:[-*+]|\d{1,9}[.)])[ \t]+$/.test(prefix);
}

/** micromark's three character classes for flanking (`micromark-util-classify-character`). */
type CharClass = 'whitespace' | 'punctuation' | 'other';
const UNICODE_PUNCTUATION = /\p{P}|\p{S}/u;

function classify(character: string | undefined): CharClass {
  if (character === undefined) return 'whitespace'; // end of input counts as whitespace
  if (/\s/.test(character)) return 'whitespace';
  if (UNICODE_PUNCTUATION.test(character)) return 'punctuation';
  return 'other';
}

/**
 * GFM strikethrough's flanking rules, from
 * `micromark-extension-gfm-strikethrough/lib/syntax.js`: a run can open when what follows
 * is not whitespace (and, if it is punctuation, what precedes is not a word character),
 * and can close under the mirrored condition. A run of three or more tildes is never a
 * marker — the tokenizer rejects the third one and every restart inside the run.
 */
function flanking(logical: Logical, run: Run): { open: boolean; close: boolean } {
  const before = classify(logical.text[run.start - 1]);
  const after = classify(logical.text[run.start + run.length]);
  return {
    open: after === 'other' || (after === 'punctuation' && before !== 'other'),
    close: before === 'other' || (before === 'punctuation' && after !== 'other')
  };
}

/**
 * A tilde is escaped to stop it opening strikethrough. Within one container that is
 * decidable: unescape every candidate only when no opening run could reach a closing run
 * of the same size once the escapes are gone. `~430 ms versus ~610 ms` has two runs that
 * can only *open* — no strikethrough can form, so neither tilde needs its backslash.
 */
function relaxTildes(container: Container, drop: Set<number>): void {
  const { logical } = container;
  const runs = runsOf(logical, '~').filter((run) => !run.inCode);
  const candidates = runs.filter((run) => run.allEscaped);
  if (candidates.length === 0) return;
  // A line-initial run could become a code fence; that is a block-level construct this
  // flanking analysis says nothing about, so leave the whole container alone.
  if (candidates.some((run) => atLineStart(container, run.start))) return;

  for (const opener of runs) {
    if (opener.length > 2 || !flanking(logical, opener).open) continue;
    for (const closer of runs) {
      if (closer.start <= opener.start || closer.length !== opener.length) continue;
      if (flanking(logical, closer).close) return; // a strikethrough could form
    }
  }
  for (const run of candidates) markRun(logical, run, drop);
}

/**
 * A backtick is escaped to stop it opening a code span. A run of N opens one only if a run
 * of exactly N follows it, so a candidate whose length is unique in its container is inert
 * — and leaving the length unique also guarantees the container's existing spans keep the
 * delimiters they already have.
 */
function relaxBackticks(container: Container, drop: Set<number>): void {
  const runs = runsOf(container.logical, '`');
  for (const run of runs) {
    if (!run.allEscaped || run.inCode) continue;
    if (atLineStart(container, run.start)) continue; // could become a fence
    if (runs.some((other) => other !== run && other.length === run.length)) continue;
    markRun(container.logical, run, drop);
  }
}

/** A link definition (but not a footnote definition), which makes bare `[label]` a reference. */
const DEFINITION_LINE = /^ {0,3}\[(?!\^)[^\]]*\]:/m;
/** Spaces, tabs and line endings, which a link tail may hold between its parts. */
function skipTailSpace(text: string, index: number): number {
  while (index < text.length && /[ \t\n]/.test(text[index])) index += 1;
  return index;
}

/**
 * The end of a link destination starting at `index`, or `-1` if the bytes there cannot be
 * one. Two shapes (CommonMark "Links"): a pointy-bracket destination, which may not hold an
 * unescaped `<`, `>` or a line ending; or a raw destination, which runs to the first space
 * and must keep its parentheses balanced. A raw destination may be empty.
 */
function destinationEnd(logical: Logical, index: number): number {
  const { text, escaped } = logical;
  if (text[index] === '<' && !escaped[index]) {
    for (let i = index + 1; i < text.length; i += 1) {
      if (escaped[i]) continue;
      if (text[i] === '>') return i + 1;
      if (text[i] === '<' || text[i] === '\n') return -1;
    }
    return -1;
  }
  let depth = 0;
  let i = index;
  for (; i < text.length; i += 1) {
    if (escaped[i]) continue;
    if (/[ \t\n]/.test(text[i])) break;
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') {
      if (depth === 0) break;
      depth -= 1;
    }
  }
  return depth === 0 ? i : -1;
}

/** The end of a `"…"`, `'…'` or `(…)` link title starting at `index`, or `-1`. */
function titleEnd(logical: Logical, index: number): number {
  const { text, escaped } = logical;
  const open = text[index];
  if (escaped[index] || (open !== '"' && open !== "'" && open !== '(')) return -1;
  const close = open === '(' ? ')' : open;
  for (let i = index + 1; i < text.length; i += 1) {
    if (escaped[i]) continue;
    if (text[i] === close) return i + 1;
    if (open === '(' && text[i] === '(') return -1; // a title in parens may not nest one
  }
  return -1;
}

/**
 * True when `](` at `index` really can close an inline link or image — i.e. a destination,
 * an optional title and a `)` follow. This is the question remark cannot ask: it escapes
 * every `[` and every `]`-adjacent `(` because one *might* be a link, and GFM example 337,
 * `[a](url &quot;tit&quot;)`, is the case where one is not. `&quot;` is an entity, not the
 * `"` that opens a title, so the tail is not a tail and the whole thing is literal text.
 */
function closesInlineLink(logical: Logical, index: number): boolean {
  let i = skipTailSpace(logical.text, index + 2);
  const destination = destinationEnd(logical, i);
  if (destination < 0) return false;
  i = skipTailSpace(logical.text, destination);
  if (i > destination) {
    const title = titleEnd(logical, i);
    if (title >= 0) i = skipTailSpace(logical.text, title);
  }
  return logical.text[i] === ')' && !logical.escaped[i];
}

/**
 * True when some `]` in the container could turn a `[` into a link, image, reference or
 * definition: `][` and `]:` always can, and `](` can when a real tail follows it.
 */
function hasLinkClosing(logical: Logical): boolean {
  for (let i = 0; i < logical.text.length; i += 1) {
    if (logical.text[i] !== ']') continue;
    const next = logical.text[i + 1];
    if (next === '[' || next === ':') return true;
    if (next === '(' && closesInlineLink(logical, i)) return true;
  }
  return false;
}

/** True when only blockquote markers, spaces and a list marker precede `index` on its line. */
function atListMarker(container: Container, index: number): boolean {
  if (container.inlineOnly) return false;
  const text = container.logical.text;
  const prefix = text.slice(text.lastIndexOf('\n', index - 1) + 1, index);
  return /^[\s>]*(?:[-*+]|\d{1,9}[.)])[ \t]+$/.test(prefix);
}

/**
 * A bracket is escaped to stop it starting a link, image, reference or definition, and a
 * `(` right after a `]` is escaped for the same reason. All of those need a `]` that can
 * close — followed by `(`, `[` or `:` — and a footnote reference needs `[^`. When the
 * container has no such `]`, and the document defines no link labels, both characters are
 * text. A `[` after a list marker still stays escaped: there it would become a task-list
 * checkbox, which is not a link construct and so is not covered by that reasoning.
 */
function relaxLinkSyntax(container: Container, drop: Set<number>): void {
  const { logical } = container;
  if (container.documentHasDefinitions || hasLinkClosing(logical)) return;
  for (let i = 0; i < logical.text.length; i += 1) {
    if (!logical.escaped[i] || logical.code[i]) continue;
    if (logical.text[i] === '(') {
      // The only `(` remark escapes in prose is one after a `]` (`mdast-util-to-markdown`'s
      // unsafe list); anything else carries a backslash the writer typed.
      if (logical.text[i - 1] !== ']') continue;
    } else if (logical.text[i] === '[') {
      if (atListMarker(container, i)) continue; // could become a checkbox
      if (logical.text[i + 1] === '^') continue; // a footnote reference
      if (logical.text[i + 1] === '[' || logical.text[i - 1] === '[') continue; // a wikilink
    } else {
      continue;
    }
    drop.add(logical.origin[i] - 1);
  }
}

function markRun(logical: Logical, run: Run, drop: Set<number>): void {
  for (let i = run.start; i < run.start + run.length; i += 1) drop.add(logical.origin[i] - 1);
}

function relaxContainer(raw: string, documentHasDefinitions: boolean, inlineOnly = false): string {
  if (!ANY_RELAXABLE_ESCAPE.test(raw)) return raw;
  const logical = toLogical(raw);
  if (!logical.escaped.some((was, i) => was && RELAXABLE.has(logical.text[i]))) return raw;

  const container: Container = { logical, inlineOnly, documentHasDefinitions };
  const drop = new Set<number>();
  relaxTildes(container, drop);
  relaxBackticks(container, drop);
  relaxLinkSyntax(container, drop);
  if (drop.size === 0) return raw;

  let out = '';
  for (let i = 0; i < raw.length; i += 1) if (!drop.has(i)) out += raw[i];
  return out;
}

/**
 * Split a table row on its cell pipes. GFM splits a row into cells *before* it parses
 * their inlines — only `\|` escapes a pipe — so each cell is its own inline container and
 * gets its own answer. Separators are kept so the row rebuilds byte-for-byte.
 */
function relaxTableRow(line: string, documentHasDefinitions: boolean): string {
  const parts: string[] = [];
  let cell = '';
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '\\' && i + 1 < line.length) {
      cell += line.slice(i, i + 2);
      i += 1;
      continue;
    }
    if (line[i] === '|') {
      parts.push(relaxContainer(cell, documentHasDefinitions, true), '|');
      cell = '';
      continue;
    }
    cell += line[i];
  }
  parts.push(relaxContainer(cell, documentHasDefinitions, true));
  return parts.join('');
}

/**
 * Remove every escape the document can prove it does not need. Containers are the runs of
 * lines between blank lines (inline constructs never cross one) and, inside a table, the
 * individual cells.
 */
export function relaxEscapes(markdown: string): string {
  if (!ANY_RELAXABLE_ESCAPE.test(markdown)) return markdown;
  const documentHasDefinitions = DEFINITION_LINE.test(markdown);

  const out: string[] = [];
  let block: string[] = [];
  let fence: string | null = null;

  const flush = () => {
    if (block.length === 0) return;
    out.push(...relaxContainer(block.join('\n'), documentHasDefinitions).split('\n'));
    block = [];
  };

  for (const line of markdown.split('\n')) {
    if (fence) {
      const close = FENCE_CLOSE.exec(line);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
      out.push(line);
      continue;
    }
    const open = FENCE_LINE.exec(line);
    if (open) {
      flush();
      fence = open[1];
      out.push(line);
      continue;
    }
    if (line.trim() === '') {
      flush();
      out.push(line);
      continue;
    }
    if (TABLE_ROW.test(line)) {
      flush();
      out.push(relaxTableRow(line, documentHasDefinitions));
      continue;
    }
    block.push(line);
  }
  flush();
  return out.join('\n');
}
