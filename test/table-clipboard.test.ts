import { describe, it, expect } from 'vitest';
import { CellSelection } from 'prosemirror-tables';
import { mountEditor } from './helpers/editor';
import { cellRangeClipboard } from '../src/webview/plugins/table-clipboard';

/** High-fidelity cell-range copy → real <table> HTML + TSV (plugins/table-clipboard.ts). */

async function selectRange(md: string, fromText: string, toText: string) {
  const { handle } = await mountEditor(md);
  const view = handle.getView();
  const cellPosOf = (text: string): number => {
    // Return the position of the table_cell/header node that contains `text`.
    let cellPos = -1;
    view.state.doc.descendants((node, pos) => {
      if ((node.type.name === 'table_cell' || node.type.name === 'table_header') && node.textContent === text)
        cellPos = pos;
    });
    return cellPos;
  };
  return CellSelection.create(view.state.doc, cellPosOf(fromText), cellPosOf(toText));
}

describe('table high-fidelity copy', () => {
  it('serializes a cell range to a real <table> and TSV', async () => {
    const sel = await selectRange(
      '| A | B |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |\n',
      '1',
      '4'
    );
    const { html, tsv } = cellRangeClipboard(sel, sel.$anchorCell.doc.type.schema);
    expect(html.startsWith('<table>')).toBe(true);
    expect(html).toContain('<tr><td>1</td><td>2</td></tr>');
    expect(html).toContain('<tr><td>3</td><td>4</td></tr>');
    // TSV: tabs between columns, newline between rows.
    expect(tsv).toBe('1\t2\n3\t4');
  });

  it('preserves inline formatting inside a cell', async () => {
    const sel = await selectRange('| H |\n| - |\n| **bold** |\n| x |\n', 'bold', 'x');
    const { html } = cellRangeClipboard(sel, sel.$anchorCell.doc.type.schema);
    expect(html).toContain('<strong>bold</strong>');
  });
});
