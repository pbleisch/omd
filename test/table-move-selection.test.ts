import { describe, it, expect, beforeAll } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { moveTableColumn, moveTableRow, findTable, TableMap } from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';
import { mountEditor } from './helpers/editor';
import { setBlocks } from '../src/webview/blocks/registry';
import { SHIPPED_BLOCKS } from '../src/shared/blocks';

/**
 * Pins the constraint that `table-controls.ts` selects a column/row on *mousedown* to satisfy.
 *
 * `moveTableColumn`/`moveTableRow` use their `pos` option only to *find* the table; the line being
 * moved is resolved from `tr.selection` (`getSelectionRangeInColumn(tr, i)` → `getCellsInColumn(i,
 * tr.selection)`). With the selection outside the table they return false and silently change
 * nothing — which is what made drag-to-reorder look broken: the overlay is chrome that never
 * touches the table's DOM, so a drag placed no selection in it.
 *
 * If someone makes the handle's selection lazy again, these assertions still pass but the drag
 * breaks — so the "outside" case is documented here as the reason the eager selection exists.
 */

const DOC = `Intro paragraph well outside the table.

| A  | B  |
| -- | -- |
| a1 | b1 |
| a2 | b2 |
`;

/** The first cell's position, plus a position far outside the table. */
function locate(view: EditorView) {
  let tablePos = -1;
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === 'table' && tablePos < 0) tablePos = pos;
  });
  const table = findTable(view.state.doc.resolve(tablePos + 1))!;
  const map = TableMap.get(table.node);
  return { firstCell: table.start + map.map[0], outside: 2 };
}

function selectAt(view: EditorView, pos: number) {
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
}

describe('table move commands depend on the selection, not just `pos`', () => {
  beforeAll(() => setBlocks(SHIPPED_BLOCKS));

  it('moveTableColumn is a silent no-op when the selection is outside the table', async () => {
    const { handle } = await mountEditor(DOC);
    const view = handle.getView();
    const { firstCell, outside } = locate(view);
    selectAt(view, outside);

    const ok = moveTableColumn({ from: 0, to: 1, pos: firstCell })(view.state, view.dispatch);

    expect(ok).toBe(false);
    expect(handle.getMarkdown()).toBe(DOC); // unchanged
  });

  it('moveTableColumn works when the selection is inside the table', async () => {
    const { handle } = await mountEditor(DOC);
    const view = handle.getView();
    const { firstCell } = locate(view);
    selectAt(view, firstCell + 2);

    const ok = moveTableColumn({ from: 0, to: 1, pos: firstCell })(view.state, view.dispatch);

    expect(ok).toBe(true);
    expect(handle.getMarkdown()).toContain('| B  | A  |');
    expect(handle.getMarkdown()).toContain('| b1 | a1 |');
  });

  it('moveTableRow has the same selection dependency', async () => {
    const { handle } = await mountEditor(DOC);
    const view = handle.getView();
    const { firstCell, outside } = locate(view);

    selectAt(view, outside);
    expect(moveTableRow({ from: 1, to: 2, pos: firstCell })(view.state, view.dispatch)).toBe(false);
    expect(handle.getMarkdown()).toBe(DOC);

    selectAt(view, firstCell + 2);
    expect(moveTableRow({ from: 1, to: 2, pos: firstCell })(view.state, view.dispatch)).toBe(true);
    expect(handle.getMarkdown()).toContain('| a2 | b2 |\n| a1 | b1 |');
  });
});
