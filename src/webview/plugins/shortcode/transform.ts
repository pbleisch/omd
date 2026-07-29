import { matchOpen, matchClose } from '../../../shared/shortcode';

/**
 * The parse-side half of the shortcode contract: fold flat `html` comment siblings into
 * real tree nodes so the schema can render them (docs/design/SMART-BLOCKS.md). remark parses an
 * `<!-- omd:… -->` comment as a block-level `html` node; a container's opener, body, and
 * closer therefore arrive as *siblings*, not a nesting. This transform pairs balanced
 * open/close tags by name (so containers nest) and wraps the body between them; an `omd:`
 * opener with no matching close is a leaf.
 *
 * It produces two custom mdast node types the schema's `parseMarkdown` matches:
 *   - `omdLeaf`      { name, params, raw }
 *   - `omdContainer` { name, params, openRaw, closeRaw, children }
 * The raw delimiter strings are preserved verbatim so serialization is byte-faithful.
 */
export interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  [k: string]: unknown;
}

/**
 * The comment text a node carries as a shortcode delimiter, or null. Milkdown's remark
 * parses a full-line `<!-- … -->` as a *paragraph wrapping a single inline `html` node*,
 * not a block-level `html` node — so a delimiter is either shape.
 */
export function delimiterHtml(node: MdNode): string | null {
  if (node.type === 'html' && typeof node.value === 'string') return node.value;
  if (node.type === 'paragraph' && node.children?.length === 1) {
    const only = node.children[0];
    if (only.type === 'html' && typeof only.value === 'string') return only.value;
  }
  return null;
}

/** Find the sibling index of the balanced close for the opener at `openIdx`, or -1. */
function findClose(children: MdNode[], openIdx: number, name: string): number {
  let depth = 1;
  for (let j = openIdx + 1; j < children.length; j++) {
    const html = delimiterHtml(children[j]);
    if (html === null) continue;
    if (matchOpen(html)?.name === name) depth++;
    else if (matchClose(html)?.name === name) {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

/** Rewrite one level of siblings, recursing into each container's collected body. */
export function pairShortcodes(children: MdNode[]): MdNode[] {
  const out: MdNode[] = [];
  let i = 0;
  while (i < children.length) {
    const node = children[i];
    const html = delimiterHtml(node);
    const open = html !== null ? matchOpen(html) : null;
    if (open && html !== null) {
      const closeIdx = findClose(children, i, open.name);
      if (closeIdx !== -1) {
        let inner = pairShortcodes(children.slice(i + 1, closeIdx));
        // A chart's embedded preview SVG is a generated artifact, not editable content: lift it
        // out of the body into an attr (round-trips verbatim, byte-stable) so the model holds
        // only the data table and OMD draws its own live chart (#chart-preview).
        let svg = '';
        if (open.name === 'chart') {
          const idx = inner.findIndex((c) => c.type === 'html' && /^\s*<svg[\s>]/.test(String(c.value ?? '')));
          if (idx !== -1) {
            svg = String(inner[idx].value ?? '');
            inner = inner.filter((_, k) => k !== idx);
          }
        }
        out.push({
          type: 'omdContainer',
          name: open.name,
          params: open.params,
          openRaw: html,
          closeRaw: delimiterHtml(children[closeIdx]) as string,
          svg,
          children: inner
        });
        i = closeIdx + 1;
        continue;
      }
      // An opener with no matching close is just a leaf shortcode.
      out.push({ type: 'omdLeaf', name: open.name, params: open.params, raw: html });
      i++;
      continue;
    }
    out.push(node);
    i++;
  }
  return out;
}

/** Mutate a parsed mdast root in place, folding shortcode delimiters into tree nodes. */
export function transformRoot(tree: MdNode): void {
  if (Array.isArray(tree.children)) tree.children = pairShortcodes(tree.children);
}
