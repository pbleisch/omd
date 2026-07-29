import { delimiterHtml, type MdNode } from '../shortcode/transform';

/**
 * The `collapsible` block's native form is a real `<details>` element (docs/design/SMART-BLOCKS.md,
 * "Native patterns") — GitHub folds it natively, so the construct needs no shortcode. Like
 * the aligned div, the opener and `</details>` arrive as flat `html` siblings around the
 * markdown body; this folds them into an `omdDetails` node whose delimiter bytes are kept
 * verbatim for a byte-faithful round-trip.
 *
 * The opener commonly carries the summary on the same HTML block:
 *   `<details>\n<summary>Title</summary>`
 */
const DETAILS_OPEN = /^<details(\s[^>]*)?>/i;
const DETAILS_CLOSE = /^<\/details>$/i;
const SUMMARY = /<summary(?:\s[^>]*)?>([\s\S]*?)<\/summary>/i;

export function isDetailsOpen(html: string): boolean {
  return DETAILS_OPEN.test(html.trim());
}

/** The summary text carried by an opener, if any. */
export function summaryOf(html: string): string {
  const m = SUMMARY.exec(html);
  return m ? m[1].trim() : '';
}

/** Whether the opener declares the section initially expanded (`<details open>`). */
export function isOpenByDefault(html: string): boolean {
  const m = DETAILS_OPEN.exec(html.trim());
  return !!m && /\bopen\b/i.test(m[1] ?? '');
}

function findClose(children: MdNode[], openIdx: number): number {
  let depth = 1;
  for (let j = openIdx + 1; j < children.length; j++) {
    const html = delimiterHtml(children[j]);
    if (html === null) continue;
    const t = html.trim();
    if (isDetailsOpen(t)) depth++;
    else if (DETAILS_CLOSE.test(t)) {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

export function pairDetails(children: MdNode[]): MdNode[] {
  const out: MdNode[] = [];
  let i = 0;
  while (i < children.length) {
    const html = delimiterHtml(children[i]);
    if (html !== null && isDetailsOpen(html)) {
      const closeIdx = findClose(children, i);
      if (closeIdx !== -1) {
        out.push({
          type: 'omdDetails',
          summary: summaryOf(html),
          openByDefault: isOpenByDefault(html),
          openRaw: html.trim(),
          closeRaw: (delimiterHtml(children[closeIdx]) as string).trim(),
          children: pairDetails(children.slice(i + 1, closeIdx))
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

export function transformDetails(tree: MdNode): void {
  if (Array.isArray(tree.children)) tree.children = pairDetails(tree.children);
}
