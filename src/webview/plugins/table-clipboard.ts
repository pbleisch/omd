import { $prose } from '@milkdown/utils';
import { Plugin } from 'prosemirror-state';
import { DOMSerializer, type Node as PMNode, type Schema } from 'prosemirror-model';
import { CellSelection, TableMap } from 'prosemirror-tables';

/**
 * High-fidelity copy for a table cell range. ProseMirror's default clipboard serializes a
 * `CellSelection` as bare `<tr>`/`<td>` fragments with no wrapping `<table>`, which pastes poorly
 * into Excel / Sheets / Word / Docs. This plugin intercepts copy/cut of a cell range and writes:
 *   - `text/html`: a real `<table>` (cell inline content preserved via the schema's DOMSerializer),
 *   - `text/plain`: TSV (tab-separated columns, newline-separated rows) — the format spreadsheets
 *     read when there's no HTML.
 * It only fires on **copy** of a `CellSelection`; every other selection — and cut, which needs to
 * also delete and would be suppressed by our `preventDefault` — falls through to the default. It
 * never mutates the document, so nothing here touches the round-trip.
 */

/** The selected cells as a row-major matrix (GFM has no row/col spans, so this is a clean grid). */
function cellMatrix(sel: CellSelection): PMNode[][] {
  const table = sel.$anchorCell.node(-1);
  const map = TableMap.get(table);
  const start = sel.$anchorCell.start(-1);
  const rect = map.rectBetween(sel.$anchorCell.pos - start, sel.$headCell.pos - start);
  const rows: PMNode[][] = [];
  for (let r = rect.top; r < rect.bottom; r++) {
    const row: PMNode[] = [];
    const seen = new Set<number>();
    for (let c = rect.left; c < rect.right; c++) {
      const pos = map.map[r * map.width + c];
      if (seen.has(pos)) continue;
      seen.add(pos);
      const cell = table.nodeAt(pos);
      if (cell) row.push(cell);
    }
    rows.push(row);
  }
  return rows;
}

/** Build `{ html: <table>…, tsv: … }` for a cell range. Exported for unit tests. */
export function cellRangeClipboard(sel: CellSelection, schema: Schema): { html: string; tsv: string } {
  const matrix = cellMatrix(sel);
  const serializer = DOMSerializer.fromSchema(schema);
  const htmlRows = matrix
    .map((row) => {
      const cells = row
        .map((cell) => {
          // A GFM cell is a single paragraph; emit its inline content directly so cells read as
          // `<td>text</td>` (cleaner for spreadsheets) rather than `<td><p>text</p></td>`.
          const inline =
            cell.childCount === 1 && cell.firstChild?.type.name === 'paragraph'
              ? cell.firstChild.content
              : cell.content;
          const holder = document.createElement('div');
          holder.appendChild(serializer.serializeFragment(inline));
          return `<td>${holder.innerHTML}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  const html = `<table><tbody>${htmlRows}</tbody></table>`;
  const tsv = matrix
    .map((row) => row.map((cell) => cell.textContent.replace(/[\t\n]+/g, ' ').trim()).join('\t'))
    .join('\n');
  return { html, tsv };
}

export const tableClipboard = $prose(
  () =>
    new Plugin({
      props: {
        handleDOMEvents: {
          copy: writeClipboard
        }
      }
    })
);

function writeClipboard(view: import('prosemirror-view').EditorView, event: ClipboardEvent): boolean {
  const sel = view.state.selection;
  if (!(sel instanceof CellSelection) || !event.clipboardData) return false;
  const { html, tsv } = cellRangeClipboard(sel, view.state.schema);
  event.clipboardData.setData('text/html', html);
  event.clipboardData.setData('text/plain', tsv);
  event.preventDefault(); // required for our setData to take effect over the default serialization
  return true;
}
