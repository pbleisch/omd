import { $nodeSchema, $remark } from '@milkdown/utils';

/**
 * A literal `<br>` as a real line break that still saves byte-for-byte.
 *
 * A hand-written `<br>` (the common GFM hard-break idiom) survives remark parsing as an inline
 * `html` node, but Milkdown's mdast→ProseMirror step then either drops it (`a<br>b` → `ab`, silent
 * data loss) or degrades it to a soft break (`a<br>\nb` → `a\nb`). Backslash / two-space hard
 * breaks already round-trip as `\`, so those are left alone — this only rescues the `<br>` form.
 *
 * The remark transform replaces each `<br>`/`<br/>`/`<br />` `html` node with a custom `omdBr` node
 * carrying its exact bytes; the schema renders it as a `<br>` (a genuine line break) and re-emits
 * those bytes verbatim as inline HTML on save. Modeled on the autolink plugin's raw-preservation.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MdNode = { type: string; value?: string; children?: any[]; raw?: string; [k: string]: any };

/** `<br>`, `<br/>`, `<br />` — case-insensitive, optional whitespace. */
const BR_RE = /^<br\s*\/?>$/i;

function isBr(n: MdNode): boolean {
  return n.type === 'html' && typeof n.value === 'string' && BR_RE.test(n.value.trim());
}

/**
 * mdast parents that hold *inline* (phrasing) content. A literal `<br>` the user wrote lives inside
 * one of these; Milkdown's empty-block `<br />` marker is a standalone *block* html node (the sole
 * body of an empty footnote/tab, among shortcode-comment siblings). Converting only inside inline
 * parents keeps us from hijacking that marker — which would break the empty-block round-trip.
 */
const INLINE_PARENTS = new Set(['paragraph', 'heading', 'tableCell', 'emphasis', 'strong', 'delete', 'link']);

function convertBreaks(node: MdNode): void {
  if (!Array.isArray(node.children)) return;
  const inline = INLINE_PARENTS.has(node.type);
  node.children = node.children.map((k) => {
    if (inline && isBr(k)) return { type: 'omdBr', raw: (k.value as string).trim() };
    convertBreaks(k);
    return k;
  });
}

export const remarkHardBreak = $remark('omd-hardbreak', () => () => (tree: MdNode) => {
  convertBreaks(tree);
});

export const hardBreakSchema = $nodeSchema('omdBr', () => ({
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  attrs: { raw: { default: '<br>' } },
  parseDOM: [{ tag: 'br[data-omd-br]', getAttrs: (dom) => ({ raw: (dom as HTMLElement).dataset.omdBr || '<br>' }) }],
  toDOM: (node) => ['br', { 'data-omd-br': node.attrs.raw as string, class: 'omd-br' }],
  parseMarkdown: {
    match: ({ type }) => type === 'omdBr',
    runner: (state, node, type) => {
      state.addNode(type, { raw: (node.raw as string) ?? '<br>' });
    }
  },
  toMarkdown: {
    match: (node) => node.type.name === 'omdBr',
    // Re-emit the exact bytes as inline raw HTML (the same trick the aligned block uses).
    runner: (state, node) => {
      state.addNode('html', undefined, node.attrs.raw as string);
    }
  }
}));
