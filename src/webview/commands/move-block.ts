import { NodeSelection, TextSelection } from 'prosemirror-state';
import type { EditorState } from 'prosemirror-state';
import { Fragment } from 'prosemirror-model';
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { isInTable } from 'prosemirror-tables';
import { closeHistory } from 'prosemirror-history';
import { CALLOUT_MARKER } from '../blocks/callout-kinds';
import { buildTableCommands } from './table';

/**
 * Move the block around the cursor up or down among its siblings (Alt+Up / Alt+Down) — the
 * "move line" gesture from Word, Google Docs, and VS Code, applied to the document tree
 * instead of to lines of text.
 *
 * The movable unit is the **deepest ancestor of the cursor that has a sibling in the
 * direction of travel**. That single rule produces every case a writer expects: a cursor in
 * a one-paragraph list item walks up to the list item (the paragraph has no sibling) and
 * reorders the list; a cursor in the second paragraph of a multi-paragraph item moves that
 * paragraph inside the item; a cursor in a top-level paragraph reorders it against the
 * heading or code block next to it; the only paragraph of a blockquote walks up so the whole
 * blockquote moves.
 *
 * A node only ever swaps with a sibling under the same parent, so nesting depth never
 * changes — nothing is promoted out of a list, absorbed into a neighbour, or merged. The
 * whole subtree travels with the node, and the selection travels with it too, so repeated
 * presses walk the same content through the document.
 *
 * This is a real transform on the document (Principle 3): re-serialization derives blank
 * lines, list tightness, and ordered-list numbering from the tree, so a move can't perturb
 * the separators around a fence, a table, or an HTML block, and can't flip a tight list
 * loose. (Setext headings are already normalized to ATX on save — docs/design/FORMATS.md.)
 */

/** Nodes anchored at the top of the file: they never move, and nothing moves above them. */
const ANCHORED = new Set(['frontmatter']);

/**
 * Containers laid out horizontally. Their children are never reordered by a vertical key —
 * Alt+Up in a table cell or a column must not swap it with the one to its left. A cursor
 * inside one walks straight past it, so the container itself is what moves.
 */
const HORIZONTAL = new Set(['table_row', 'columns']);

/**
 * A GitHub alert's `[!NOTE]` marker is a real first paragraph that the callout decoration
 * hides (`plugins/callouts.ts`), so it is invisible to the writer. Slot 0 of such a
 * blockquote is anchored the way front matter is: nothing swaps with it and it never moves,
 * or a body block would step over an invisible node and silently turn the alert into a plain
 * blockquote with raw markup showing. The walk-up then continues outward, so Alt+Arrow in a
 * one-block alert still moves the whole callout.
 */
function isAnchoredCalloutMarker(parent: PMNode, index: number): boolean {
  if (index !== 0 || parent.type.name !== 'blockquote' || parent.childCount === 0) return false;
  return CALLOUT_MARKER.test(parent.child(0).textContent);
}

/** One candidate level: a child of `parent` at `index`, starting at document position `start`. */
interface Level {
  parent: PMNode;
  index: number;
  start: number;
}

/**
 * The ancestor chain of the selection head, innermost first — the order the walk-up
 * considers. A node selection contributes the selected node itself as the innermost
 * candidate, since the cursor is not inside any textblock.
 */
function levels(state: EditorState): Level[] {
  const sel = state.selection;
  const out: Level[] = [];
  if (sel instanceof NodeSelection) {
    const $from = sel.$from;
    out.push({ parent: $from.parent, index: $from.index(), start: sel.from });
    for (let d = $from.depth; d >= 1; d--) {
      out.push({ parent: $from.node(d - 1), index: $from.index(d - 1), start: $from.before(d) });
    }
    return out;
  }
  const $head = sel.$head;
  for (let d = $head.depth; d >= 1; d--) {
    out.push({ parent: $head.node(d - 1), index: $head.index(d - 1), start: $head.before(d) });
  }
  return out;
}

/** `parent`'s children with the two slots swapped. */
function swapped(parent: PMNode, a: number, b: number): Fragment {
  const children: PMNode[] = [];
  parent.forEach((child) => children.push(child));
  [children[a], children[b]] = [children[b], children[a]];
  return Fragment.fromArray(children);
}

/** The node to move for this direction, or null when nothing above/below can take it. */
function findMovable(state: EditorState, dir: 1 | -1): (Level & { node: PMNode }) | null {
  for (const level of levels(state)) {
    if (HORIZONTAL.has(level.parent.type.name)) continue;
    const node = level.parent.child(level.index);
    if (!node.isBlock || ANCHORED.has(node.type.name)) continue;
    const target = level.index + dir;
    if (target < 0 || target >= level.parent.childCount) continue; // no sibling that way — walk up
    const sibling = level.parent.child(target);
    if (!sibling.isBlock || ANCHORED.has(sibling.type.name)) continue;
    // Neither side of the swap may be an alert's hidden marker line.
    if (isAnchoredCalloutMarker(level.parent, level.index)) continue;
    if (isAnchoredCalloutMarker(level.parent, target)) continue;
    // The swap has to leave the parent legal. A list item is `paragraph block*`, so its
    // trailing sublist can't step over the item's own first paragraph — that level declines
    // and the walk continues outward rather than producing a document the schema rejects.
    if (!level.parent.type.validContent(swapped(level.parent, level.index, target))) continue;
    return { ...level, node };
  }
  return null;
}

/** Inside a table the vertical unit is the row, which the table commands already move. */
function moveTableRow(view: EditorView, dir: 1 | -1): boolean {
  const id = dir < 0 ? 'table-row-move-up' : 'table-row-move-down';
  const cmd = buildTableCommands(view.state.schema).find((c) => c.id === id);
  return cmd ? cmd.run(view) : false;
}

/**
 * Move the block containing the selection head one slot in `dir`, or return false when it is
 * already at the end of its list of siblings (so the key falls through to another handler
 * rather than being silently swallowed).
 */
export function moveBlock(dir: 1 | -1): (view: EditorView) => boolean {
  return (view) => {
    const { state } = view;
    // A table's rows are its vertical siblings; `moveTableRow` keeps the GFM header fixed.
    if (isInTable(state)) return moveTableRow(view, dir);

    const found = findMovable(state, dir);
    if (!found) return false;
    const { parent, index, start, node } = found;
    const sibling = parent.child(index + dir);
    const end = start + node.nodeSize;
    // Where the node lands: before the previous sibling, or after the next one (which has
    // shifted left by the node's own size once the node is lifted out).
    const to = dir < 0 ? start - sibling.nodeSize : end + sibling.nodeSize - node.nodeSize;

    let tr = state.tr.delete(start, end).insert(to, node);

    // Ordered-list markers are positional and the schema caches them on each item, so swap
    // the two labels to keep the rendered numbering sequential after the content moves.
    if (parent.type.name === 'ordered_list' && node.attrs.label !== sibling.attrs.label) {
      const siblingTo = dir < 0 ? to + node.nodeSize : to - sibling.nodeSize;
      tr = tr.setNodeMarkup(to, undefined, { ...node.attrs, label: sibling.attrs.label });
      tr = tr.setNodeMarkup(siblingTo, undefined, { ...sibling.attrs, label: node.attrs.label });
    }

    // The selection rides along with the node it lives in. A selection that reaches outside
    // the moved node (several blocks at once) collapses to its head, which is the block that
    // actually moved.
    const delta = to - start;
    const { anchor, head } = state.selection;
    const contained = (p: number): boolean => p >= start && p <= end;
    if (state.selection instanceof NodeSelection && state.selection.from === start) {
      tr = tr.setSelection(NodeSelection.create(tr.doc, to));
    } else if (contained(anchor) && contained(head)) {
      tr = tr.setSelection(TextSelection.create(tr.doc, anchor + delta, head + delta));
    } else {
      tr = tr.setSelection(TextSelection.near(tr.doc.resolve(head + delta)));
    }

    // A reorder is one discrete structural act, so it gets its own history entry. Without
    // this, prosemirror-history groups moves with whatever it was adjacent to in the last
    // `newGroupDelay`, so repeated presses collapse into a single undo.
    view.dispatch(closeHistory(tr.scrollIntoView()));
    view.focus();
    return true;
  };
}
