import { describe, it, expect } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { mountEditor } from './helpers/editor';

/** Spreadsheet-style Tab/Enter navigation (plugins/table-nav.ts) on top of the gfm keymap. */

async function tableEditor(md: string) {
  const { handle } = await mountEditor(md);
  const view = handle.getView();
  const cursorIn = (text: string): void => {
    let pos: number | null = null;
    view.state.doc.descendants((node, p) => {
      if (pos == null && node.isText && node.text === text) pos = p + 1;
      return pos == null;
    });
    if (pos != null) view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
  };
  const key = (k: string): void => {
    view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  };
  // Which cell's text does the caret sit in?
  const cellText = (): string | null => {
    const $from = view.state.selection.$from;
    for (let d = $from.depth; d > 0; d--) {
      const n = $from.node(d);
      if (n.type.name === 'table_cell' || n.type.name === 'table_header') return n.textContent;
    }
    return null;
  };
  const rowCount = (): number => {
    let rows = 0;
    view.state.doc.descendants((n) => {
      if (n.type.name === 'table_row') rows++;
    });
    return rows;
  };
  return { handle, view, cursorIn, key, cellText, rowCount };
}

describe('table keyboard navigation', () => {
  it('Tab in the last cell appends a row and moves into it', async () => {
    const t = await tableEditor('| H |\n| - |\n| A |\n| B |\n');
    expect(t.rowCount()).toBe(2); // A + B (header row is a separate node type)
    t.cursorIn('B'); // last cell
    t.key('Tab');
    expect(t.rowCount()).toBe(3); // a fresh data row was appended
    expect(t.cellText()).toBe(''); // caret sits in the new empty cell
  });

  it('Tab mid-table just moves to the next cell (no new row)', async () => {
    const t = await tableEditor('| H1 | H2 |\n| - | - |\n| A | B |\n');
    t.cursorIn('A');
    t.key('Tab');
    expect(t.cellText()).toBe('B');
    expect(t.rowCount()).toBe(1);
  });

  it('Enter moves to the cell directly below', async () => {
    const t = await tableEditor('| H |\n| - |\n| A |\n| B |\n');
    t.cursorIn('A');
    t.key('Enter');
    expect(t.cellText()).toBe('B'); // dropped into the row below, same column
  });
});
