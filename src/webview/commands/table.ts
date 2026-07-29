import type { Command as PMCommand, EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Schema, Node as PMNode } from 'prosemirror-model';
import {
  addRowBefore,
  addRowAfter,
  addColumnBefore,
  addColumnAfter,
  deleteRow,
  deleteColumn,
  deleteTable,
  isInTable,
  selectionCell,
  selectedRect,
  moveTableRow,
  moveTableColumn,
  TableMap
} from 'prosemirror-tables';
import type { OmdCommand } from './registry';

/**
 * Table operations as registry commands (Phase 1). They wrap `prosemirror-tables`
 * primitives in the same `OmdCommand` shape everything else uses, so the context menu is a
 * thin front-end over them (Principle 4) and a keymap could bind the identical `run`
 * later without a second implementation. Every command no-ops off a table, so the menu can
 * offer them unconditionally and they simply do nothing when the cursor isn't in a cell.
 *
 * These are kept out of `buildCommands` because they're context-scoped (they never appear
 * in the toolbar or slash menu) — but they're the same type, exercised the same way.
 */

type Align = 'left' | 'center' | 'right' | null;

/** Run a ProseMirror command against the live view and refocus. */
function fromPM(cmd: PMCommand): (view: EditorView) => boolean {
  return (view) => {
    const ok = cmd(view.state, view.dispatch, view);
    view.focus();
    return ok;
  };
}

/**
 * Set a whole column's alignment. GFM alignment is per-column, not per-cell, so setting
 * one cell would serialize inconsistently; we write the `alignment` attr on every cell in
 * the column. Safe because markdown tables never merge cells (each map slot is distinct).
 */
export function setColumnAlign(align: Align): PMCommand {
  return (state, dispatch) => {
    if (!isInTable(state)) return false;
    const $cell = selectionCell(state);
    const table = $cell.node(-1);
    const tableStart = $cell.start(-1);
    const map = TableMap.get(table);
    const rect = map.findCell($cell.pos - tableStart);
    const col = rect.left;
    if (!dispatch) return true;
    let tr = state.tr;
    for (let rowRel = 0; rowRel < map.height; rowRel++) {
      const cellOffset = map.map[rowRel * map.width + col];
      const cellNode = table.nodeAt(cellOffset);
      if (!cellNode) continue;
      tr = tr.setNodeMarkup(tableStart + cellOffset, undefined, {
        ...cellNode.attrs,
        alignment: align
      });
    }
    dispatch(tr);
    return true;
  };
}

function tableActive(state: EditorState): boolean {
  return isInTable(state);
}

/**
 * Move the row containing the selection up/down. The header (row 0) stays put — data rows
 * reorder among themselves — so the GFM header/separator contract is preserved.
 */
function moveRow(dir: -1 | 1): PMCommand {
  return (state, dispatch, view) => {
    if (!isInTable(state)) return false;
    const rect = selectedRect(state);
    const from = rect.top;
    const to = from + dir;
    if (from < 1 || to < 1 || to >= rect.map.height) return false; // keep row 0 as the header
    return moveTableRow({ from, to })(state, dispatch, view);
  };
}

/** Move the column containing the selection left/right. */
function moveColumn(dir: -1 | 1): PMCommand {
  return (state, dispatch, view) => {
    if (!isInTable(state)) return false;
    const rect = selectedRect(state);
    const from = rect.left;
    const to = from + dir;
    if (to < 0 || to >= rect.map.width) return false;
    return moveTableColumn({ from, to })(state, dispatch, view);
  };
}

/**
 * Sort the data rows by the selected column, ascending or descending. This is a *real edit* — it
 * rewrites the row order on disk (GFM can't carry a sort direction, so there's no view-only state)
 * — but it only reorders whole `table_row` nodes, so cell contents and the round-trip are intact.
 * The header row is left in place. `localeCompare({ numeric: true })` gives a natural sort, so a
 * numeric column orders 2 < 10 rather than lexically.
 */
export function sortColumn(dir: 'asc' | 'desc'): PMCommand {
  return (state, dispatch) => {
    if (!isInTable(state)) return false;
    const $cell = selectionCell(state);
    const table = $cell.node(-1);
    const tablePos = $cell.before(-1);
    const tableStart = $cell.start(-1);
    const map = TableMap.get(table);
    const col = map.findCell($cell.pos - tableStart).left;

    // Child 0 is the header row; the rest are data rows. Sort those by their cell in `col`.
    const header = table.child(0);
    const rows: PMNode[] = [];
    for (let i = 1; i < table.childCount; i++) rows.push(table.child(i));
    if (rows.length < 2) return false; // nothing to reorder
    const keyOf = (row: PMNode): string =>
      col < row.childCount ? row.child(col).textContent.trim() : '';
    const sign = dir === 'desc' ? -1 : 1;
    const sorted = rows
      .map((row, i) => ({ row, i })) // stable: fall back to original index on ties
      .sort((a, b) => {
        const c = keyOf(a.row).localeCompare(keyOf(b.row), undefined, { numeric: true, sensitivity: 'base' });
        return (c || a.i - b.i) * sign;
      })
      .map((x) => x.row);

    if (sorted.every((row, i) => row === rows[i])) return false; // already in this order
    if (!dispatch) return true;
    const newTable = table.type.create(table.attrs, [header, ...sorted], table.marks);
    dispatch(state.tr.replaceWith(tablePos, tablePos + table.nodeSize, newTable));
    return true;
  };
}

export function buildTableCommands(_schema: Schema): OmdCommand[] {
  const cmd = (
    id: string,
    title: string,
    icon: string | undefined,
    pm: PMCommand
  ): OmdCommand => ({
    id,
    title,
    icon,
    run: fromPM(pm),
    isActive: tableActive
  });

  return [
    cmd('table-row-above', 'Insert row above', 'arrow-up', addRowBefore),
    cmd('table-row-below', 'Insert row below', 'arrow-down', addRowAfter),
    cmd('table-col-left', 'Insert column left', 'arrow-left', addColumnBefore),
    cmd('table-col-right', 'Insert column right', 'arrow-right', addColumnAfter),
    cmd('table-row-move-up', 'Move row up', 'arrow-up', moveRow(-1)),
    cmd('table-row-move-down', 'Move row down', 'arrow-down', moveRow(1)),
    cmd('table-col-move-left', 'Move column left', 'arrow-left', moveColumn(-1)),
    cmd('table-col-move-right', 'Move column right', 'arrow-right', moveColumn(1)),
    cmd('table-col-sort-asc', 'Sort column ascending', 'arrow-up', sortColumn('asc')),
    cmd('table-col-sort-desc', 'Sort column descending', 'arrow-down', sortColumn('desc')),
    cmd('table-align-left', 'Align left', 'arrow-small-left', setColumnAlign('left')),
    cmd('table-align-center', 'Align center', 'arrow-both', setColumnAlign('center')),
    cmd('table-align-right', 'Align right', 'arrow-small-right', setColumnAlign('right')),
    cmd('table-row-delete', 'Delete row', 'trash', deleteRow),
    cmd('table-col-delete', 'Delete column', 'trash', deleteColumn),
    cmd('table-delete', 'Delete table', 'trash', deleteTable)
  ];
}
