import type { EditorView } from 'prosemirror-view';
import { openBlockProperties, type EditableBlock } from '../blocks/edit-properties';
import { closeParamPanel, isParamPanelOpen } from './param-panel';

/**
 * Hover-to-reveal for the block property panel. A brief hover over an editable smart block
 * floats its panel below the block; moving into the panel keeps it up; leaving both the
 * block and the panel dismisses it after a short grace period so you can travel between
 * them. This is the primary, no-click way to edit a block's params — the gear and the
 * context menu open the same singleton panel immediately.
 *
 * A single controller owns the timers and the "which block is showing" state, so hovering
 * from one block to another cleanly hands the panel over rather than stacking panels.
 */

const OPEN_DELAY = 350;
const CLOSE_DELAY = 300;

let openTimer: ReturnType<typeof setTimeout> | undefined;
let closeTimer: ReturnType<typeof setTimeout> | undefined;
/** Identity of the block whose panel is currently open (a NodeView instance). */
let activeKey: unknown = null;
let pointerInPanel = false;

function clearOpen(): void {
  if (openTimer) {
    clearTimeout(openTimer);
    openTimer = undefined;
  }
}
function clearClose(): void {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = undefined;
  }
}

function scheduleClose(): void {
  clearClose();
  closeTimer = setTimeout(() => {
    closeTimer = undefined;
    if (!pointerInPanel) {
      closeParamPanel();
      activeKey = null;
    }
  }, CLOSE_DELAY);
}

/** Open a block's panel now and wire it into the hover session (used by hover + gear). */
export function openBlockPanel(key: unknown, view: EditorView, block: EditableBlock): void {
  clearOpen();
  clearClose();
  const handle = openBlockProperties(view, block);
  activeKey = key;
  pointerInPanel = false;
  // Travelling into the panel must keep it open; leaving it re-arms the close timer.
  handle.el.addEventListener('mouseenter', () => {
    pointerInPanel = true;
    clearClose();
  });
  handle.el.addEventListener('mouseleave', () => {
    pointerInPanel = false;
    scheduleClose();
  });
}

/**
 * Pointer entered a block. `resolve` returns the editable block (or null if it declares no
 * params); resolving lazily means we read the live document/registry, not construction-time
 * state. Non-editable blocks are ignored entirely so they never disturb an open panel.
 */
export function hoverEnter(
  key: unknown,
  view: EditorView,
  resolve: () => EditableBlock | null
): void {
  if (!resolve()) return;
  clearClose();
  if (activeKey === key && isParamPanelOpen()) return;
  clearOpen();
  openTimer = setTimeout(() => {
    openTimer = undefined;
    const block = resolve();
    if (block) openBlockPanel(key, view, block);
  }, OPEN_DELAY);
}

/** Pointer left a block: drop a pending open, and close if this block owns the panel. */
export function hoverLeave(key: unknown): void {
  clearOpen();
  if (activeKey === key || (activeKey === null && isParamPanelOpen())) scheduleClose();
}
