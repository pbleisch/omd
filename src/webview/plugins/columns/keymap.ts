import { $prose } from '@milkdown/utils';
import { keymap } from 'prosemirror-keymap';
import { TextSelection, type Command } from 'prosemirror-state';

/**
 * Tab / Shift-Tab move between the cells of a `columns` block — the gesture people expect from
 * columned layouts. It only acts when the cursor is directly in a column's own content; inside a
 * nested list, code block, or table (which bind Tab themselves) it defers. At the first/last
 * column it consumes Tab and stays put rather than letting focus escape the editor.
 */

const DEFER_TO = new Set(['list_item', 'code_block', 'table_cell', 'table_header']);

function moveColumn(dir: 1 | -1): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    // Find the enclosing column.
    let depth = $from.depth;
    while (depth > 0 && $from.node(depth).type.name !== 'column') depth--;
    if (depth === 0) return false; // not in a column — let other handlers run

    // A nested Tab-owning node between the column and the cursor keeps its own behaviour.
    for (let d = $from.depth; d > depth; d--) {
      if (DEFER_TO.has($from.node(d).type.name)) return false;
    }

    const columnsDepth = depth - 1;
    const columnsNode = $from.node(columnsDepth);
    if (columnsNode.type.name !== 'columns') return false;

    const target = $from.index(columnsDepth) + dir;
    if (target < 0 || target >= columnsNode.childCount) return true; // edge — consume, stay put

    // Position just inside the target column (start of its content), then land in its first text.
    let pos = $from.start(columnsDepth);
    for (let i = 0; i < target; i++) pos += columnsNode.child(i).nodeSize;
    if (dispatch) {
      const selection = TextSelection.near(state.doc.resolve(pos + 1));
      dispatch(state.tr.setSelection(selection).scrollIntoView());
    }
    return true;
  };
}

export const columnsKeymap = $prose(() =>
  keymap({ Tab: moveColumn(1), 'Shift-Tab': moveColumn(-1) })
);
