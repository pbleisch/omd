import { $nodeSchema, $remark } from '@milkdown/utils';

/**
 * Preserve HTML entities & numeric character references byte-for-byte.
 *
 * remark decodes `&copy;`→`©`, `&nbsp;`→NBSP, `&#35;`→`#` into the text node's *value* at parse, so
 * a naive save silently rewrites hand-authored entities (and `&nbsp;` vs a plain space is a real
 * semantic change). The raw bytes survive in the text node's source `position`, though — so this
 * splits each text run at its entity spans into an `omdEntity` node that renders the decoded
 * character (editable-looking) but re-emits the exact `&…;` bytes on save. Same raw-preservation
 * idea as the autolink and `<br>` plugins.
 *
 * Only `text` nodes are touched; entities inside code (inline/fenced) are already literal in remark.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MdNode = { type: string; value?: string; children?: any[]; position?: any; [k: string]: any };

/** Named (`&copy;`), decimal (`&#35;`), or hex (`&#x2A;`) reference, anchored for a scan. */
const ENTITY_AT = /^&(?:#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/;

/** The ASCII punctuation CommonMark lets a backslash escape. */
const ESCAPABLE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;

/** Decode a single entity to its character, via the browser's own parser (jsdom in tests). */
function decodeEntity(raw: string): string {
  const el = document.createElement('textarea');
  el.innerHTML = raw; // safe: `raw` only ever matches ENTITY (no tags)
  return el.value || raw;
}

/**
 * Split a text node's source into text + `omdEntity` parts, or null if it has no entities.
 *
 * The scan has to be escape-aware, because the source is *raw* bytes: the parser had already
 * consumed the backslash escapes that are still sitting in it. Carrying an escape through into a
 * text part's `value` turns it into literal backslash *content*, which the serializer then escapes
 * again — so the run grows a backslash every save, forever (issue #29). Resolving `\x` → `x` here
 * puts the text parts back in the parser's own decoded form, which serializes back to `\x`.
 *
 * A backslash also suppresses what follows it, so `\&amp;` is an escaped `&` and not an entity at
 * all — the same reason the scan can't be a plain regex sweep.
 */
function splitEntities(source: string): MdNode[] | null {
  const parts: MdNode[] = [];
  let text = '';
  let found = false;
  for (let i = 0; i < source.length; ) {
    const ch = source[i];
    if (ch === '\\' && i + 1 < source.length && ESCAPABLE.test(source[i + 1])) {
      text += source[i + 1]; // escaped: literal char, and can't open an entity
      i += 2;
      continue;
    }
    const entity = ch === '&' ? ENTITY_AT.exec(source.slice(i)) : null;
    if (entity) {
      if (text) parts.push({ type: 'text', value: text });
      text = '';
      parts.push({ type: 'omdEntity', raw: entity[0], char: decodeEntity(entity[0]) });
      found = true;
      i += entity[0].length;
      continue;
    }
    text += ch;
    i += 1;
  }
  if (!found) return null;
  if (text) parts.push({ type: 'text', value: text });
  return parts;
}

function walk(node: MdNode, source: string): void {
  if (!Array.isArray(node.children)) return;
  const out: MdNode[] = [];
  for (const child of node.children) {
    if (child.type === 'text' && child.position) {
      const src = source.slice(child.position.start.offset, child.position.end.offset);
      const parts = splitEntities(src);
      if (parts) {
        out.push(...parts);
        continue;
      }
    }
    walk(child, source);
    out.push(child);
  }
  node.children = out;
}

export const remarkEntities = $remark('omd-entities', () => () => (tree: MdNode, file: unknown) => {
  walk(tree, String(file));
});

export const entitySchema = $nodeSchema('omdEntity', () => ({
  group: 'inline',
  inline: true,
  atom: true,
  attrs: { raw: { default: '' }, char: { default: '' } },
  parseDOM: [
    {
      tag: 'span[data-omd-entity]',
      getAttrs: (dom) => ({
        raw: (dom as HTMLElement).dataset.omdEntity ?? '',
        char: (dom as HTMLElement).textContent ?? ''
      })
    }
  ],
  toDOM: (node) => ['span', { 'data-omd-entity': node.attrs.raw as string, class: 'omd-entity' }, node.attrs.char as string],
  parseMarkdown: {
    match: ({ type }) => type === 'omdEntity',
    runner: (state, node, type) => {
      state.addNode(type, { raw: (node.raw as string) ?? '', char: (node.char as string) ?? '' });
    }
  },
  toMarkdown: {
    match: (node) => node.type.name === 'omdEntity',
    // Re-emit the exact `&…;` bytes as raw (the inline-html escape hatch, like omdBr).
    runner: (state, node) => {
      state.addNode('html', undefined, node.attrs.raw as string);
    }
  }
}));
