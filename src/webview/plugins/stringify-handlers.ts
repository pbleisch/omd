/**
 * remark-stringify node handlers that override the defaults where the default emits
 * bytes that mean something *different* when they are read back. Both of these are
 * round-trip (Principle 2) fixes at the only layer that can see the whole document:
 * the serializer.
 *
 * Wired in `editor.ts` via `remarkStringifyOptionsCtx.handlers`, on top of Milkdown's
 * own handler table.
 */

import { defaultHandlers, type Handle } from 'mdast-util-to-markdown';
import type { ThematicBreak, Text, Paragraph, Parents } from 'mdast';

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

/**
 * An empty list item stays empty (#32).
 *
 * Milkdown represents a blank line as an empty paragraph and spells it `<br />` on the way
 * out (`@milkdown/preset-commonmark`'s paragraph runner, guarded by its
 * `remark-preserve-empty-line` plugin). A list item with no content — `1.` on its own line
 * in a bug-report template — parses to a list item whose only child is that empty
 * paragraph, so it came back as `1. <br />`: three characters of content the writer never
 * typed, in a file nobody edited.
 *
 * Nothing is lost by dropping it. The same plugin *deletes* `<br />` nodes on the way in,
 * so `1.` and `1. <br />` parse to exactly the same document; the two spellings are
 * indistinguishable by the time this runs, and `1.` is the one a writer meant. Empty
 * paragraphs elsewhere — between two blocks at the document root — still get their
 * `<br />`, which is what that feature is for.
 */
export const paragraphHandler: Handle = (node: Paragraph, parent, state, info) => {
  // Milkdown leaves `children` unset on a paragraph it never added a child to.
  const only = node.children?.length === 1 ? node.children[0] : undefined;
  if (parent?.type === 'listItem' && only?.type === 'html' && only.value.trim() === '<br />') {
    return '';
  }
  return defaultHandlers.paragraph(node, parent, state, info);
};

/** The handler table OMD layers over Milkdown's. */
export const omdStringifyHandlers = {
  thematicBreak: thematicBreakHandler,
  text: textHandler,
  paragraph: paragraphHandler
};
