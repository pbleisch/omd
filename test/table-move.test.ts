import { describe, it, expect } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { mountEditor } from './helpers/editor';
import { buildTableCommands } from '../src/webview/commands/table';

/** Move rows/columns via prosemirror-tables, keeping the GFM header row fixed. */

async function tableEditor(md: string) {
  const { handle } = await mountEditor(md);
  const view = handle.getView();
  const cmds = new Map(buildTableCommands(view.state.schema).map((c) => [c.id, c]));
  const putCursorIn = (text: string): void => {
    let pos: number | null = null;
    view.state.doc.descendants((node, p) => {
      if (pos == null && node.isText && node.text === text) pos = p + 1;
      return pos == null;
    });
    if (pos != null) view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
  };
  const run = (id: string): boolean => cmds.get(id)!.run(view);
  return { handle, view, run, putCursorIn };
}

describe('table move row/column', () => {
  it('moves a data row down and up', async () => {
    const t = await tableEditor('| H |\n| - |\n| A |\n| B |\n| C |\n');
    t.putCursorIn('A');
    expect(t.run('table-row-move-down')).toBe(true);
    let out = t.handle.getMarkdown();
    expect(out.indexOf('| B')).toBeLessThan(out.indexOf('| A')); // B now above A

    t.putCursorIn('A');
    expect(t.run('table-row-move-up')).toBe(true);
    out = t.handle.getMarkdown();
    expect(out.indexOf('| A')).toBeLessThan(out.indexOf('| B')); // back above B
  });

  it('does not move a data row up into the header', async () => {
    const t = await tableEditor('| H |\n| - |\n| A |\n| B |\n');
    t.putCursorIn('A'); // topmost data row
    expect(t.run('table-row-move-up')).toBe(false); // guarded — header stays
    const out = t.handle.getMarkdown();
    expect(out.indexOf('| H')).toBeLessThan(out.indexOf('| A'));
  });

  it('moves a column right', async () => {
    const t = await tableEditor('| A | B |\n| - | - |\n| 1 | 2 |\n');
    t.putCursorIn('1'); // left column
    expect(t.run('table-col-move-right')).toBe(true);
    const out = t.handle.getMarkdown();
    expect(out.indexOf('B')).toBeLessThan(out.indexOf('A')); // columns swapped in the header
  });

  it('sorts a column ascending and descending (natural, numeric-aware)', async () => {
    const t = await tableEditor('| N |\n| - |\n| 10 |\n| 2 |\n| 1 |\n');
    t.putCursorIn('10');
    expect(t.run('table-col-sort-asc')).toBe(true);
    let out = t.handle.getMarkdown();
    // Natural sort: 1 < 2 < 10 (not lexical, where "10" would precede "2").
    expect(out.indexOf('| 1 ')).toBeLessThan(out.indexOf('| 2 '));
    expect(out.indexOf('| 2 ')).toBeLessThan(out.indexOf('| 10 '));

    t.putCursorIn('10');
    expect(t.run('table-col-sort-desc')).toBe(true);
    out = t.handle.getMarkdown();
    expect(out.indexOf('| 10 ')).toBeLessThan(out.indexOf('| 2 '));
    expect(out.indexOf('| 2 ')).toBeLessThan(out.indexOf('| 1 '));
  });

  it('sorts the correct column when the cursor is in a non-first column', async () => {
    const t = await tableEditor('| City | Pop |\n| - | - |\n| Austin | 3 |\n| Boston | 1 |\n| Chicago | 2 |\n');
    t.putCursorIn('2'); // Pop column, Chicago's row
    expect(t.run('table-col-sort-asc')).toBe(true);
    const out = t.handle.getMarkdown();
    // Rows reordered by Pop: Boston(1), Chicago(2), Austin(3).
    expect(out.indexOf('Boston')).toBeLessThan(out.indexOf('Chicago'));
    expect(out.indexOf('Chicago')).toBeLessThan(out.indexOf('Austin'));
  });
});
