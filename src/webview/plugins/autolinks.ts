import { $markSchema, $remark, $inputRule } from '@milkdown/utils';
import { InputRule } from 'prosemirror-inputrules';

/**
 * Bare URLs as a real, editable, clickable link — that still saves byte-for-byte (#24a).
 *
 * GitHub's GFM autolink-literal turns a bare `https://example.com`, `www.example.com`, or
 * `bob@example.com` into an mdast `link` at parse time, byte-indistinguishable from an explicit
 * `<https://example.com>`. On save, remark-stringify then rewrites every such link in its
 * canonical form (`<url>`, or `[www.x](http://www.x)` for the www/email cases), dirtying a file
 * the user only opened. Turning them into plain text instead is *worse*: the stringifier escapes
 * the URL (`https\://…`, `a\_b\*c`) to stop it re-autolinking.
 *
 * So a literal becomes its own mark, `autolink`, which:
 *   - keeps the URL as ordinary editable text (caret goes inside; typos are fixable),
 *   - renders as a clickable `<a>` like any other link, and
 *   - serializes to the exact bytes that were written — a custom stringify handler emits the
 *     mark's raw text, skipping the escape machinery that plain text goes through.
 * Explicit `<url>` and `[label](url)` links are left as normal link marks (already byte-stable).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MdNode = { type: string; value?: string; url?: string; children?: any[]; position?: any; [k: string]: any };

/** Concatenate a node's raw text, verbatim — no markdown escaping (that's the whole point). */
function rawText(node: MdNode): string {
  if (typeof node.value === 'string') return node.value;
  if (node.children) return node.children.map(rawText).join('');
  return '';
}

/** Replace unbracketed autolink-literal `link` nodes with an `autolink` mark node. */
function markLiterals(kids: MdNode[], source: string): MdNode[] {
  return kids.map((k) => {
    if (k.type === 'link' && k.position) {
      const start = k.position.start?.offset;
      const end = k.position.end?.offset;
      if (typeof start === 'number' && typeof end === 'number') {
        // `<url>` = explicit autolink, `[text](url)` = resource link — both keep their link mark.
        // Anything else is a GFM autolink-literal.
        const first = source[start];
        if (first !== '<' && first !== '[') {
          return { type: 'autolink', url: k.url, children: k.children, position: k.position };
        }
      }
    }
    if (k.children) k.children = markLiterals(k.children, source);
    return k;
  });
}

export const remarkAutolinks = $remark('omd-autolinks', () =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function (this: any) {
    const data = this.data();
    const ext = data.toMarkdownExtensions || (data.toMarkdownExtensions = []);
    // Emit the mark's text raw, unescaped — the bytes as written.
    ext.push({ handlers: { autolink: (node: MdNode) => rawText(node) } });
    return (tree: MdNode, file: unknown) => {
      const source = String(file);
      if (tree.children) tree.children = markLiterals(tree.children, source);
    };
  } as never
);

/** The href a bare literal maps to, mirroring GFM (www → http://, email → mailto:). */
export function hrefForLiteral(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (/^www\./i.test(url)) return `http://${url}`;
  if (/^[^\s@]+@[^\s@]+$/.test(url)) return `mailto:${url}`;
  return url;
}

// A URL/email run followed by the just-typed whitespace — the live-typing trigger (#24b).
const AUTOLINK_INPUT =
  /((?:https?:\/\/|www\.)[^\s<]+|[^\s<@]+@[^\s<@]+\.[^\s<@]+)(\s)$/;
// GFM excludes trailing sentence punctuation from the link.
const TRAILING_PUNCT = /[.,;:!?]+$/;

/**
 * If `textBeforeCursor` ends with a bare URL and a whitespace character, return the URL (with
 * trailing sentence punctuation trimmed, GFM-style) and its derived href. Pure so it can be
 * unit-tested; the input rule below wires it into a live edit.
 */
export function detectAutolink(textBeforeCursor: string): { url: string; href: string } | null {
  const m = AUTOLINK_INPUT.exec(textBeforeCursor);
  if (!m) return null;
  const url = m[1].replace(TRAILING_PUNCT, ''); // don't link a trailing '.' etc.
  if (!url) return null;
  return { url, href: hrefForLiteral(url) };
}

/**
 * Live-typing autolink (#24b): finishing a bare URL with a space turns it into an `autolink`
 * mark right away, matching what a reload would produce — no need to save and re-open. The mark
 * carries all the byte-stability from (a), so a live-typed URL saves bare too.
 */
export const autolinkInputRule = $inputRule(() =>
  new InputRule(AUTOLINK_INPUT, (state, match, start, end) => {
    const marks = state.schema.marks.autolink;
    if (!marks) return null;
    const hit = detectAutolink(match[0]);
    if (!hit) return null;
    const from = start;
    const to = start + hit.url.length;
    return state.tr
      .addMark(from, to, marks.create({ href: hit.href }))
      .insertText(match[2], end) // the space isn't in the doc yet — the handler inserts it
      .removeStoredMark(marks); // keep whatever follows the space unlinked
  })
);

export const autolinkSchema = $markSchema('autolink', () => ({
  inclusive: false,
  attrs: { href: { default: '' } },
  parseDOM: [
    {
      tag: 'a[data-autolink]',
      getAttrs: (dom) => ({ href: (dom as HTMLElement).getAttribute('href') ?? '' })
    }
  ],
  toDOM: (mark) => [
    'a',
    { href: mark.attrs.href as string, 'data-autolink': 'true', class: 'omd-autolink' },
    0
  ],
  parseMarkdown: {
    match: (node) => node.type === 'autolink',
    runner: (state, node, markType) => {
      state.openMark(markType, { href: node.url });
      state.next(node.children);
      state.closeMark(markType);
    }
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'autolink',
    runner: (state, mark) => {
      state.withMark(mark, 'autolink');
    }
  }
}));
