import { delimiterHtml, type MdNode } from '../shortcode/transform';

/**
 * The GFM-visible coexistence form for content alignment (docs/design/FORMATS.md): an aligned block
 * is a `<div align="…">` — or the equally common `<p align="…">` READMEs use — wrapping real
 * markdown, so a reader on GitHub sees genuinely centered content while OMD reads the alignment off
 * the tag. The open/close arrive as flat `html` siblings around the body; this folds them into an
 * `omdAligned` node whose delimiter bytes are preserved **verbatim** (`openRaw`/`closeRaw`, re-emitted
 * unchanged), so the *exact original tag* round-trips — OMD never rewrites a `<p align>` to `<div>`.
 */

/** Tags recognized as alignment wrappers. Both render identically; the original is preserved on save. */
const OPEN = /^<(div|p)\s+align="(left|center|right)"\s*>$/;

function matchAlignOpen(html: string): { tag: string; align: string } | null {
  const m = OPEN.exec(html.trim());
  return m ? { tag: m[1], align: m[2] } : null;
}

/** Balanced close for the wrapper of `tag` at `openIdx`, counting any nested same-tag elements. */
function findClose(children: MdNode[], openIdx: number, tag: string): number {
  const openRe = new RegExp(`^<${tag}(\\s|>)`);
  const closeRe = new RegExp(`^</${tag}>$`);
  let depth = 1;
  for (let j = openIdx + 1; j < children.length; j++) {
    const html = delimiterHtml(children[j]);
    if (html === null) continue;
    const t = html.trim();
    if (openRe.test(t)) depth++;
    else if (closeRe.test(t)) {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

export function pairAligned(children: MdNode[]): MdNode[] {
  const out: MdNode[] = [];
  let i = 0;
  while (i < children.length) {
    const html = delimiterHtml(children[i]);
    const open = html !== null ? matchAlignOpen(html) : null;
    if (open && html !== null) {
      const closeIdx = findClose(children, i, open.tag);
      if (closeIdx !== -1) {
        out.push({
          type: 'omdAligned',
          align: open.align,
          openRaw: html.trim(),
          closeRaw: (delimiterHtml(children[closeIdx]) as string).trim(),
          children: pairAligned(children.slice(i + 1, closeIdx))
        });
        i = closeIdx + 1;
        continue;
      }
    }
    out.push(children[i]);
    i++;
  }
  return out;
}

export function transformAligned(tree: MdNode): void {
  if (Array.isArray(tree.children)) tree.children = pairAligned(tree.children);
}
