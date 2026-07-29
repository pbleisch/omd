import { describe, it, expect } from 'vitest';
import { CellSelection, TableMap } from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';
import { mountEditor } from './helpers/editor';

/**
 * Cell-selection highlighting: prosemirror-tables marks every cell in the selection with
 * `.selectedCell` (styled by `.selectedCell::after`). The reported bug was that not the whole
 * range highlighted; these lock in that a rectangle, a full column, and the header row all mark
 * every one of their cells — the header row included (it's selectable, just not reorderable).
 */
const TABLE = '| A | B |\n| :- | :- |\n| c1 | c2 |\n| c3 | c4 |\n';

function locateTable(view: EditorView): { start: number; map: TableMap } {
  let pos = -1;
  let node = null as ReturnType<EditorView['state']['doc']['nodeAt']>;
  view.state.doc.descendants((n, p) => {
    if (n.type.name === 'table') {
      node = n;
      pos = p;
      return false;
    }
    return true;
  });
  if (!node) throw new Error('no table');
  return { start: pos + 1, map: TableMap.get(node) };
}

async function selectedFor(anchor: [number, number], head: [number, number]): Promise<string[]> {
  const { handle, root } = await mountEditor(TABLE);
  const view = handle.getView();
  const { start, map } = locateTable(view);
  const cell = (r: number, c: number) => start + map.map[r * map.width + c];
  view.dispatch(
    view.state.tr.setSelection(
      CellSelection.create(view.state.doc, cell(...anchor), cell(...head))
    )
  );
  return [...root.querySelectorAll('.selectedCell')].map((td) => (td.textContent ?? '').trim()).sort();
}

describe('table cell-selection highlighting', () => {
  it('a cell range highlights every cell in the rectangle', async () => {
    expect(await selectedFor([1, 0], [2, 1])).toEqual(['c1', 'c2', 'c3', 'c4']);
  });

  it('a full column highlights the header cell too', async () => {
    expect(await selectedFor([0, 0], [2, 0])).toEqual(['A', 'c1', 'c3']);
  });

  it('the header row highlights all of its cells', async () => {
    expect(await selectedFor([0, 0], [0, 1])).toEqual(['A', 'B']);
  });
});
