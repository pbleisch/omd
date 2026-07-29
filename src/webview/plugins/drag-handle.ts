import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey, type EditorState, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { codicon } from '../codicons';

/**
 * Drag-to-reorder for top-level blocks (Phase 5). A grip appears in the left gutter of the
 * block under the pointer; dragging it moves the whole block to a new position, with a line
 * showing where it will land. Nesting (list items, table cells) is out of scope — this
 * reorders the document's direct children, which is the common "move this paragraph / this
 * smart block" gesture.
 *
 * Drag is implemented with plain pointer events rather than native HTML5 DnD, so it never
 * competes with ProseMirror's own drag handling, and the move is one real transaction
 * (`moveBlock`) so it round-trips like any edit.
 */

interface TopBlock {
  from: number;
  to: number;
}

/** The top-level block whose rendered box contains the viewport point, or null. */
function blockAtCoords(view: EditorView, x: number, y: number): TopBlock | null {
  const hit = view.posAtCoords({ left: x, top: y });
  if (!hit) return null;
  const $pos = view.state.doc.resolve(hit.pos);
  if ($pos.depth === 0) return null;
  const from = $pos.before(1);
  const node = view.state.doc.nodeAt(from);
  if (!node) return null;
  return { from, to: from + node.nodeSize };
}

/**
 * A transaction that lifts the block at [from,to] and re-inserts it at `target` (a
 * top-level boundary), or null for a no-op (dropping a block back onto itself). Deleting
 * first and mapping the target keeps the insert position correct when moving downward.
 */
export function moveBlock(
  state: EditorState,
  from: number,
  to: number,
  target: number
): Transaction | null {
  if (target >= from && target <= to) return null;
  const node = state.doc.nodeAt(from);
  if (!node) return null;
  let tr = state.tr.delete(from, to);
  const insertAt = tr.mapping.map(target);
  tr = tr.insert(insertAt, node);
  return tr;
}

const key = new PluginKey('omd-drag-handle');

class DragHandle {
  private readonly grip: HTMLElement;
  private readonly indicator: HTMLElement;
  private hovered: TopBlock | null = null;
  private dragging: TopBlock | null = null;
  private dropTarget: number | null = null;

  constructor(private readonly view: EditorView) {
    this.grip = document.createElement('div');
    this.grip.className = 'omd-drag-handle';
    this.grip.style.display = 'none';
    this.grip.appendChild(codicon('gripper'));
    this.grip.addEventListener('mousedown', (e) => this.onGripDown(e));

    this.indicator = document.createElement('div');
    this.indicator.className = 'omd-drag-indicator';
    this.indicator.style.display = 'none';

    document.body.append(this.grip, this.indicator);

    this.onDocMove = this.onDocMove.bind(this);
    this.onDocUp = this.onDocUp.bind(this);
    document.addEventListener('mousemove', this.onHoverMove);
  }

  // --- hover: park the grip beside the block under the pointer ---

  /** How far into the left margin the grip stays reachable (must cover the grip's offset). */
  private static readonly GUTTER = 44;

  private readonly onHoverMove = (e: MouseEvent): void => {
    if (this.dragging) return;
    // Keep the grip while the pointer is on it, so moving out to grab it doesn't dismiss it.
    if (e.target === this.grip || this.grip.contains(e.target as Node)) return;

    const area = this.view.dom.getBoundingClientRect();
    const withinRow = e.clientY >= area.top && e.clientY <= area.bottom;
    const withinReach = e.clientX >= area.left - DragHandle.GUTTER && e.clientX <= area.right;
    if (!withinRow || !withinReach) {
      this.hideGrip();
      return;
    }

    // In the left margin there's no text to hit-test, so clamp x into the content and use
    // the pointer's y — that resolves the block on the same line as the gutter hover.
    const x = Math.max(e.clientX, area.left + 1);
    const block = blockAtCoords(this.view, x, e.clientY);
    if (!block) {
      this.hideGrip();
      return;
    }
    this.hovered = block;
    const dom = this.view.nodeDOM(block.from);
    if (!(dom instanceof HTMLElement)) {
      this.hideGrip();
      return;
    }
    const rect = dom.getBoundingClientRect();
    this.grip.style.display = '';
    // Outer gutter — the fold caret (heading-fold) takes the inner slot at ~-16px, so on a
    // heading the two don't collide.
    this.grip.style.left = `${rect.left - 40}px`;
    this.grip.style.top = `${rect.top + 2}px`;
  };

  private hideGrip(): void {
    this.grip.style.display = 'none';
    this.hovered = null;
  }

  // --- drag ---

  private onGripDown(e: MouseEvent): void {
    if (!this.hovered) return;
    e.preventDefault();
    this.dragging = this.hovered;
    document.body.classList.add('omd-dragging-block');
    document.addEventListener('mousemove', this.onDocMove, true);
    document.addEventListener('mouseup', this.onDocUp, true);
  }

  private onDocMove(e: MouseEvent): void {
    if (!this.dragging) return;
    // The pointer is usually in the gutter during a drag, so clamp into the content (and
    // within its vertical span) to resolve the block the drop line should snap to.
    const area = this.view.dom.getBoundingClientRect();
    const x = Math.max(e.clientX, area.left + 1);
    const y = Math.min(Math.max(e.clientY, area.top + 1), area.bottom - 1);
    const block = blockAtCoords(this.view, x, y);
    if (!block) {
      this.indicator.style.display = 'none';
      this.dropTarget = null;
      return;
    }
    const dom = this.view.nodeDOM(block.from);
    if (!(dom instanceof HTMLElement)) return;
    const rect = dom.getBoundingClientRect();
    // Above the block's midline drops before it, below drops after it.
    const before = e.clientY < rect.top + rect.height / 2;
    this.dropTarget = before ? block.from : block.to;
    this.indicator.style.display = '';
    this.indicator.style.left = `${rect.left}px`;
    this.indicator.style.width = `${rect.width}px`;
    this.indicator.style.top = `${(before ? rect.top : rect.bottom) - 1}px`;
  }

  private onDocUp(): void {
    const src = this.dragging;
    const target = this.dropTarget;
    this.endDrag();
    if (!src || target == null) return;
    const tr = moveBlock(this.view.state, src.from, src.to, target);
    if (tr) {
      this.view.dispatch(tr.scrollIntoView());
      this.view.focus();
    }
  }

  private endDrag(): void {
    this.dragging = null;
    this.dropTarget = null;
    this.indicator.style.display = 'none';
    document.body.classList.remove('omd-dragging-block');
    document.removeEventListener('mousemove', this.onDocMove, true);
    document.removeEventListener('mouseup', this.onDocUp, true);
    this.hideGrip();
  }

  destroy(): void {
    this.endDrag();
    document.removeEventListener('mousemove', this.onHoverMove);
    this.grip.remove();
    this.indicator.remove();
  }
}

export const dragHandlePlugin = $prose(
  () =>
    new Plugin({
      key,
      view: (view) => {
        const handle = new DragHandle(view);
        return { destroy: () => handle.destroy() };
      }
    })
);
