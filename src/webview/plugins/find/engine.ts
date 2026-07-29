import type { Node as ProseNode } from 'prosemirror-model';

/**
 * The pure find engine (Phase 4). No DOM, no editor view — a document and a query in, match
 * ranges out — so the matching rules are unit-tested in isolation from the plugin chrome.
 * Matches are reported in ProseMirror document coordinates so the plugin can decorate and
 * replace them directly.
 */

export interface FindOptions {
  caseSensitive: boolean;
  regex: boolean;
}

export interface Match {
  from: number;
  to: number;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compile the query to a global RegExp, or null when it's empty or an invalid pattern
 * (so a half-typed regex highlights nothing rather than throwing).
 */
export function buildQueryRegex(query: string, opts: FindOptions): RegExp | null {
  if (!query) return null;
  const flags = opts.caseSensitive ? 'g' : 'gi';
  try {
    return new RegExp(opts.regex ? query : escapeRegExp(query), flags);
  } catch {
    return null;
  }
}

/**
 * The literal replacement for one match — expanding regex backreferences (`$1`, `$<name>`,
 * `$&`, `$$`) when in regex mode, via `String.replace` over the match's own text. In literal
 * mode the replacement is used verbatim. `matched` must be exactly the matched substring.
 */
export function expandReplacement(
  matched: string,
  query: string,
  opts: FindOptions,
  replacement: string
): string {
  if (!opts.regex) return replacement;
  const re = buildQueryRegex(query, opts);
  if (!re) return replacement;
  // A non-global copy, so replace expands the single match rather than scanning.
  const single = new RegExp(re.source, re.flags.replace('g', ''));
  return matched.replace(single, replacement);
}

/**
 * All matches of `query` across the document's textblocks. Searching is per-textblock so a
 * match never spans a paragraph boundary; within a block, characters map back to their real
 * document positions (which stay correct across mark boundaries, e.g. a bold run inside a
 * word). Inline atoms contribute no search text.
 */
export function findMatches(doc: ProseNode, query: string, opts: FindOptions): Match[] {
  const re = buildQueryRegex(query, opts);
  if (!re) return [];

  const matches: Match[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;

    let text = '';
    const posOf: number[] = []; // posOf[i] = document position of search-text char i
    node.forEach((child, offset) => {
      if (child.isText && child.text) {
        const base = pos + 1 + offset;
        for (let i = 0; i < child.text.length; i++) {
          text += child.text[i];
          posOf.push(base + i);
        }
      }
    });

    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++; // guard against zero-width matches spinning forever
        continue;
      }
      const from = posOf[m.index];
      const to = posOf[m.index + m[0].length - 1] + 1;
      matches.push({ from, to });
    }
    return false; // textblocks don't nest; don't descend into inline content
  });
  return matches;
}
