/**
 * remark-stringify node handlers that override the defaults where the default emits
 * bytes that mean something *different* when they are read back. Both of these are
 * round-trip (Principle 2) fixes at the only layer that can see the whole document:
 * the serializer.
 *
 * Wired in `editor.ts` via `remarkStringifyOptionsCtx.handlers`, on top of Milkdown's
 * own handler table.
 */

import type { Handle } from 'mdast-util-to-markdown';
import type { ThematicBreak, Text, Parents } from 'mdast';

/**
 * A document-initial thematic break must not be spelled `---` (#23).
 *
 * `micromark-extension-frontmatter` opens front matter on any `---` at line 1, column 1
 * and closes it on the next `---` anywhere later — blank lines and prose in between are
 * not checked, and there is no option to make it stricter. So a document that starts
 * with a thematic break and contains any later `---` re-parses as a single front matter
 * node on reopen: the file stops being prose. The bytes round-trip perfectly; only their
 * meaning is destroyed, which is why the byte-level assertion never sees it.
 *
 * `***` renders identically on GitHub and cannot open front matter. The repo's stated
 * stringify policy (`rule: '-'`, i.e. `---`) is unchanged everywhere else — this is the
 * one position where the writer's own spelling is not being preserved anyway.
 *
 * Real front matter is unaffected: it parses to a `yaml` node, never a `thematicBreak`.
 */
export const thematicBreakHandler: Handle = (
  node: ThematicBreak,
  parent: Parents | undefined,
  state
) => {
  if (parent?.type === 'root' && parent.children[0] === node) return '***';
  // Otherwise the mdast-util-to-markdown default, driven by the configured rule options.
  const rule = state.options.rule ?? '*';
  const spaces = state.options.ruleSpaces ?? false;
  const value = (rule + (spaces ? ' ' : '')).repeat(state.options.ruleRepetition ?? 3);
  return spaces ? value.slice(0, -1) : value;
};

/**
 * Text is always escaped through `state.safe()` (#30).
 *
 * `@milkdown/core` overrides remark's `text` handler with a bypass: a value matching
 * `/^[^*_\\]*\s+$/` (no `*`, `_` or `\`, ending in whitespace) is returned raw, skipping
 * `state.safe()` entirely. Any escape the writer typed in such a node is then dropped —
 * `\|` in a table cell loses its backslash and the row gains a column on reopen,
 * `\[not a ref]` becomes a link-reference candidate, and `\<div>` becomes inline HTML.
 *
 * This restores remark's own behaviour. Trailing whitespace is not what `safe()` removes
 * — it escapes markdown-significant characters and leaves spaces alone — so the bypass
 * costs correctness and buys nothing; `test/stringify-handlers.test.ts` covers the
 * trailing-space shapes it was presumably protecting.
 *
 * `encode: []` is kept from Milkdown's version: it suppresses character-reference
 * encoding, which OMD's entity handling depends on.
 */
export const textHandler: Handle = (node: Text, _parent, state, info) =>
  state.safe(node.value, { ...info, encode: [] });

/** The handler table OMD layers over Milkdown's. */
export const omdStringifyHandlers = {
  thematicBreak: thematicBreakHandler,
  text: textHandler
};
