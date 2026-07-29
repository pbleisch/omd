import { delimiterHtml, type MdNode } from '../shortcode/transform';

/**
 * Multi-column (`2col` / `3col`) in its GFM-visible form (docs/design/FORMATS.md): a raw HTML table
 * whose cells hold real markdown separated by blank lines. GitHub renders the table and the
 * markdown inside it, so a plain reader sees genuine columns — the machinery *is* the
 * rendering. remark hands us the table pieces as flat `html` siblings around the cell
 * content, so this pairs them into an `omdColumns` node with one `omdColumn` per cell.
 *
 *   <table><tr><td>      ← opener
 *   …cell markdown…
 *   </td><td>            ← separator
 *   …cell markdown…
 *   </td></tr></table>   ← closer
 */
const OPEN = /^<table[^>]*>\s*<tr[^>]*>\s*<td[^>]*>$/i;
const SEP = /^<\/td>\s*<td[^>]*>$/i;
const CLOSE = /^<\/td>\s*<\/tr>\s*<\/table>$/i;

export const isColumnsOpen = (html: string): boolean => OPEN.test(html.trim());
export const isColumnsSep = (html: string): boolean => SEP.test(html.trim());
export const isColumnsClose = (html: string): boolean => CLOSE.test(html.trim());

/** Index of the closer for the opener at `openIdx`, or -1. Nested tables are counted. */
function findClose(children: MdNode[], openIdx: number): number {
  let depth = 1;
  for (let j = openIdx + 1; j < children.length; j++) {
    const html = delimiterHtml(children[j]);
    if (html === null) continue;
    if (isColumnsOpen(html)) depth++;
    else if (isColumnsClose(html)) {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

export function pairColumns(children: MdNode[]): MdNode[] {
  const out: MdNode[] = [];
  let i = 0;
  while (i < children.length) {
    const html = delimiterHtml(children[i]);
    if (html !== null && isColumnsOpen(html)) {
      const closeIdx = findClose(children, i);
      if (closeIdx !== -1) {
        // Split the span between opener and closer on the `</td><td>` separators.
        const cells: MdNode[] = [];
        let current: MdNode[] = [];
        let sepRaw = '';
        let depth = 0;
        for (let j = i + 1; j < closeIdx; j++) {
          const inner = delimiterHtml(children[j]);
          if (inner !== null) {
            if (isColumnsOpen(inner)) depth++;
            else if (isColumnsClose(inner)) depth--;
            else if (depth === 0 && isColumnsSep(inner)) {
              cells.push({ type: 'omdColumn', sepRaw, children: pairColumns(current) });
              current = [];
              sepRaw = inner.trim();
              continue;
            }
          }
          current.push(children[j]);
        }
        cells.push({ type: 'omdColumn', sepRaw, children: pairColumns(current) });

        out.push({
          type: 'omdColumns',
          openRaw: html.trim(),
          closeRaw: (delimiterHtml(children[closeIdx]) as string).trim(),
          children: cells
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

export function transformColumns(tree: MdNode): void {
  if (Array.isArray(tree.children)) tree.children = pairColumns(tree.children);
}
