import { $prose } from '@milkdown/utils';
import { keymap } from 'prosemirror-keymap';
import { TextSelection, type Command } from 'prosemirror-state';
import { isInTable, goToNextCell, addRowAfter, selectedRect } from 'prosemirror-tables';

/**
 * Spreadsheet-style keyboard nav on top of the gfm preset's own `tableKeymap`. This plugin is
 * loaded *before* the preset so it gets first crack at Tab/Enter inside a table; every command
 * returns `false` off a table (or at a boundary it doesn't own), so the preset's bindings — and
 * everything else's Tab/Enter — still run everywhere else.
 *
 *  - **Tab** at the last cell adds a row and lands in its first cell (the gesture that lets you
 *    fill a table straight down without reaching for the mouse). Elsewhere it defers to the
 *    preset's next-cell navigation.
 *  - **Enter** moves to the cell directly below in the same column. In the last row it defers, so
 *    the preset's Enter (exit the table) still gets you out.
 *
 * All of this only reorders the cursor — no cell content changes except the appended empty row —
 * so the round-trip is untouched.
 */

/** Tab: next cell, or at the very last cell append a row and move into it. */
const tabOrAddRow: Command = (state, dispatch, view) => {
  if (!isInTable(state)) return false;
  if (goToNextCell(1)(state, dispatch, view)) return true;
  // No next cell → we're in the last cell. Append a row, then step into it.
  if (!dispatch || !view) return true;
  addRowAfter(view.state, view.dispatch);
  goToNextCell(1)(view.state, view.dispatch, view);
  return true;
};

/** Enter: move to the cell directly below; defer in the last row so the table can be exited. */
const downCell: Command = (state, dispatch) => {
  if (!isInTable(state)) return false;
  const rect = selectedRect(state);
  const below = rect.bottom; // row index directly under a single-cell selection
  if (below >= rect.map.height) return false; // last row — let the preset exit the table
  if (!dispatch) return true;
  const cellPos = rect.tableStart + rect.map.map[below * rect.map.width + rect.left];
  const sel = TextSelection.near(state.doc.resolve(cellPos + 1));
  dispatch(state.tr.setSelection(sel).scrollIntoView());
  return true;
};

export const tableNavKeymap = $prose(() => keymap({ Tab: tabOrAddRow, Enter: downCell }));
