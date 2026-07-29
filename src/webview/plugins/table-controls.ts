import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey, TextSelection, type Command as PMCommand } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import {
  CellSelection,
  TableMap,
  moveTableRow,
  moveTableColumn,
  addRowBefore,
  addRowAfter,
  addColumnBefore,
  addColumnAfter
} from 'prosemirror-tables';
import { codicon } from '../codicons';
import { sortColumn } from '../commands/table';

/**
 * On-canvas table affordances (Notion / Confluence style) so the move / insert / select ops
 * don't live only in the right-click menu. Hovering a table reveals:
 *   - a **column bar** above it and a **row bar** to its left — each segment selects that whole
 *     line on click, and drags to reorder it (the header row is pinned);
 *   - **"+" buttons** on the column/row boundaries to insert there.
 *
 * It's a floating overlay positioned from live cell rects (`view.nodeDOM(cellPos)`), so it never
 * touches the table's own DOM. Every gesture routes through the same `prosemirror-tables`
 * primitives the context menu uses, so behaviour and round-tripping are identical — this is pure
 * chrome over commands that already exist and are tested.
 */

const key = new PluginKey('omd-table-controls');

/** Where a column/row lands when dropped on boundary `boundary`, dragging from `from` (or null). */
export function dropTargetIndex(from: number, boundary: number): number | null {
  const to = boundary > from ? boundary - 1 : boundary;
  return to === from ? null : to;
}

interface Active {
  pos: number; // table node position
  start: number; // position just inside the table (TableMap offsets are relative to this)
  map: TableMap;
  node: PMNode;
}

interface Drag {
  kind: 'col' | 'row';
  from: number;
  target: number | null;
}

const BAR = 20; // thickness of the row/column bars, px (roomy enough for the sort glyph)

class TableControls {
  private readonly layer: HTMLElement;
  private readonly dropLine: HTMLElement;
  private active: Active | null = null;
  private signature = '';
  private drag: Drag | null = null;
  // Which column is currently sorted, and how. Ephemeral (GFM carries no sort state) — it just
  // drives the direction arrow on the handle and toggles asc/desc on repeated clicks.
  private sortState: { pos: number; col: number; dir: 'asc' | 'desc' } | null = null;

  constructor(private readonly view: EditorView) {
    this.layer = document.createElement('div');
    this.layer.className = 'omd-tbl-ctl-layer';
    this.dropLine = document.createElement('div');
    this.dropLine.className = 'omd-tbl-dropline';
    this.dropLine.style.display = 'none';
    this.layer.appendChild(this.dropLine);
    document.body.appendChild(this.layer);

    this.onHover = this.onHover.bind(this);
    this.onDragMove = this.onDragMove.bind(this);
    this.onDragUp = this.onDragUp.bind(this);
    this.onScroll = this.onScroll.bind(this);
    document.addEventListener('mousemove', this.onHover);
    // The overlay is viewport-fixed; without this it stays put while the table scrolls away.
    // Capture so it catches scrolling on any ancestor scroll container, not just window.
    document.addEventListener('scroll', this.onScroll, true);
  }

  /** Re-anchor the overlay to the (moved) table on scroll, keeping handles aligned. */
  private onScroll(): void {
    if (!this.active || this.drag) return;
    this.signature = ''; // geometry moved — force a re-layout at the new positions
    this.layout(this.active);
  }

  // --- geometry ---

  private resolveTable(x: number, y: number): Active | null {
    const hit = this.view.posAtCoords({ left: x, top: y });
    if (!hit) return null;
    const $pos = this.view.state.doc.resolve(hit.pos);
    for (let d = $pos.depth; d > 0; d--) {
      const node = $pos.node(d);
      if (node.type.name === 'table') {
        return { pos: $pos.before(d), start: $pos.start(d), map: TableMap.get(node), node };
      }
    }
    return null;
  }

  private cellDom(a: Active, row: number, col: number): HTMLElement | null {
    const offset = a.map.map[row * a.map.width + col];
    const dom = this.view.nodeDOM(a.start + offset);
    return dom instanceof HTMLElement ? dom : null;
  }

  private cellPos(a: Active, row: number, col: number): number {
    return a.start + a.map.map[row * a.map.width + col];
  }

  // --- hover: (re)build the overlay for the table under the pointer ---

  private onHover(e: MouseEvent): void {
    if (this.drag) return;
    if (this.layer.contains(e.target as Node)) return; // don't dismiss while on the controls

    const area = this.view.dom.getBoundingClientRect();
    const near =
      e.clientY >= area.top - 40 &&
      e.clientY <= area.bottom &&
      e.clientX >= area.left - 40 &&
      e.clientX <= area.right + 40;
    if (!near) return this.hide();

    // Clamp into the content so a hover in the top/left gutter still resolves the table.
    const x = Math.min(Math.max(e.clientX, area.left + 1), area.right - 1);
    const y = Math.min(Math.max(e.clientY, area.top + 1), area.bottom - 1);
    const table = this.resolveTable(x, y);
    if (!table) return this.hide();
    this.layout(table);
  }

  private hide(): void {
    if (!this.active) return;
    this.active = null;
    this.signature = '';
    // Keep the dropLine node; drop every handle we built.
    for (const el of Array.from(this.layer.querySelectorAll('.omd-tbl-handle, .omd-tbl-insert')))
      el.remove();
  }

  private layout(a: Active): void {
    const { width, height } = a.map;
    const first = this.cellDom(a, 0, 0);
    const lastCol = this.cellDom(a, 0, width - 1);
    const lastRow = this.cellDom(a, height - 1, 0);
    if (!first || !lastCol || !lastRow) return this.hide();
    const top = first.getBoundingClientRect().top;
    const left = first.getBoundingClientRect().left;
    const right = lastCol.getBoundingClientRect().right;
    const bottom = lastRow.getBoundingClientRect().bottom;

    const sig = `${a.pos}:${width}x${height}:${Math.round(left)},${Math.round(top)},${Math.round(right)},${Math.round(bottom)}`;
    if (sig === this.signature) return; // nothing moved — leave the DOM alone
    this.active = a;
    this.signature = sig;
    // Clip the viewport-fixed overlay below the sticky toolbar so handles that scroll up under it
    // are hidden rather than drawing on top of it.
    const toolbar = document.querySelector('.omd-toolbar-host');
    const clipTop = toolbar ? Math.max(0, Math.round(toolbar.getBoundingClientRect().bottom)) : 0;
    this.layer.style.clipPath = `inset(${clipTop}px 0px 0px 0px)`;
    for (const el of Array.from(this.layer.querySelectorAll('.omd-tbl-handle, .omd-tbl-insert')))
      el.remove();

    // Column bar + column insert points.
    for (let c = 0; c < width; c++) {
      const r = this.cellDom(a, 0, c)!.getBoundingClientRect();
      this.addHandle('col', c, r.left, top - BAR, r.width, BAR);
    }
    for (let b = 0; b <= width; b++) {
      const x = b === 0 ? left : this.cellDom(a, 0, b - 1)!.getBoundingClientRect().right;
      this.addInsert('col', b, x, top - BAR);
    }

    // Row bar + row insert points (boundaries 1..height only — the header row stays first).
    for (let rr = 0; rr < height; rr++) {
      const r = this.cellDom(a, rr, 0)!.getBoundingClientRect();
      this.addHandle('row', rr, left - BAR, r.top, BAR, r.height);
    }
    for (let b = 1; b <= height; b++) {
      const y = b >= height ? bottom : this.cellDom(a, b, 0)!.getBoundingClientRect().top;
      this.addInsert('row', b, left - BAR, y);
    }
  }

  private addHandle(kind: 'col' | 'row', index: number, x: number, y: number, w: number, h: number): void {
    const el = document.createElement('div');
    el.className = `omd-tbl-handle omd-tbl-handle--${kind}`;
    if (kind === 'row' && index === 0) el.classList.add('omd-tbl-handle--header');
    Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    el.addEventListener('mousedown', (ev) => this.onHandleDown(ev, kind, index));
    if (kind === 'col') el.appendChild(this.buildSortButton(index));
    this.layer.appendChild(el);
  }

  /** Sort toggle that rides on a column handle: neutral glyph until sorted, then a direction arrow. */
  private buildSortButton(col: number): HTMLElement {
    const active =
      this.sortState && this.active && this.sortState.pos === this.active.pos && this.sortState.col === col;
    const btn = document.createElement('button');
    btn.className = 'omd-tbl-sort' + (active ? ' omd-tbl-sort--active' : '');
    btn.title = active ? `Sorted ${this.sortState!.dir} — click to flip` : 'Sort column';
    const glyph = active ? (this.sortState!.dir === 'asc' ? 'triangle-up' : 'triangle-down') : 'sort-precedence';
    btn.appendChild(codicon(glyph));
    // Stop the handle's own mousedown (select/drag) from firing when the sort button is used.
    btn.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
    });
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (this.active) this.sortColumnClick(this.active, col);
    });
    return btn;
  }

  private sortColumnClick(a: Active, col: number): void {
    let dir: 'asc' | 'desc' = 'asc';
    if (this.sortState && this.sortState.pos === a.pos && this.sortState.col === col)
      dir = this.sortState.dir === 'asc' ? 'desc' : 'asc';
    this.sortState = { pos: a.pos, col, dir };
    const row = a.map.height > 1 ? 1 : 0; // a real data row if there is one
    this.runAtCell(this.cellPos(a, row, col), sortColumn(dir));
    // Sorting reorders rows but leaves table geometry unchanged, so nothing would re-fire layout;
    // force a rebuild to swap the neutral glyph for the active-direction arrow.
    this.signature = '';
    this.layout(a);
  }

  private addInsert(kind: 'col' | 'row', boundary: number, x: number, y: number): void {
    const el = document.createElement('button');
    el.className = `omd-tbl-insert omd-tbl-insert--${kind}`;
    el.title = kind === 'col' ? 'Insert column' : 'Insert row';
    el.appendChild(codicon('add'));
    // Centre the button on the boundary line.
    Object.assign(el.style, { left: `${x}px`, top: `${y}px` });
    el.addEventListener('mousedown', (ev) => ev.preventDefault());
    el.addEventListener('click', (ev) => {
      ev.preventDefault();
      if (this.active) kind === 'col' ? this.insertColumn(this.active, boundary) : this.insertRow(this.active, boundary);
    });
    this.layer.appendChild(el);
  }

  // --- commands (same primitives as the context menu) ---

  private runAtCell(cellPos: number, cmd: PMCommand): void {
    const sel = TextSelection.near(this.view.state.doc.resolve(cellPos + 1));
    this.view.dispatch(this.view.state.tr.setSelection(sel));
    cmd(this.view.state, this.view.dispatch, this.view);
    this.view.focus();
  }

  private selectColumn(a: Active, col: number): void {
    const anchor = this.cellPos(a, 0, col);
    const head = this.cellPos(a, a.map.height - 1, col);
    this.view.dispatch(this.view.state.tr.setSelection(CellSelection.create(this.view.state.doc, anchor, head)));
    this.view.focus();
  }

  private selectRow(a: Active, row: number): void {
    const anchor = this.cellPos(a, row, 0);
    const head = this.cellPos(a, row, a.map.width - 1);
    this.view.dispatch(this.view.state.tr.setSelection(CellSelection.create(this.view.state.doc, anchor, head)));
    this.view.focus();
  }

  private insertColumn(a: Active, boundary: number): void {
    if (boundary >= a.map.width) this.runAtCell(this.cellPos(a, 0, a.map.width - 1), addColumnAfter);
    else this.runAtCell(this.cellPos(a, 0, boundary), addColumnBefore);
  }

  private insertRow(a: Active, boundary: number): void {
    if (boundary >= a.map.height) this.runAtCell(this.cellPos(a, a.map.height - 1, 0), addRowAfter);
    else this.runAtCell(this.cellPos(a, boundary, 0), addRowBefore);
  }

  // --- drag to reorder ---

  private onHandleDown(e: MouseEvent, kind: 'col' | 'row', index: number): void {
    if (!this.active) return;
    e.preventDefault();
    this.drag = { kind, from: index, target: null };
    // A plain click (no move before mouseup) selects the line instead of reordering. The header
    // row is selectable this way too — it just can't be *reordered* (guarded in onDragMove).
    this.pendingSelect = () => (kind === 'col' ? this.selectColumn(this.active!, index) : this.selectRow(this.active!, index));
    this.moved = false;
    document.body.classList.add('omd-dragging-block');
    document.addEventListener('mousemove', this.onDragMove, true);
    document.addEventListener('mouseup', this.onDragUp, true);
  }

  private pendingSelect: (() => void) | null = null;
  private moved = false;

  private onDragMove(e: MouseEvent): void {
    const a = this.active;
    const drag = this.drag;
    if (!a || !drag) return;
    this.moved = true;
    if (drag.kind === 'row' && drag.from === 0) return; // header row: selectable, never reordered
    if (drag.kind === 'col') {
      const boundary = this.nearestColBoundary(a, e.clientX);
      drag.target = dropTargetIndex(drag.from, boundary);
      this.showColDropLine(a, boundary);
    } else {
      const boundary = this.nearestRowBoundary(a, e.clientY);
      drag.target = dropTargetIndex(drag.from, boundary);
      this.showRowDropLine(a, boundary);
    }
  }

  private nearestColBoundary(a: Active, clientX: number): number {
    let best = 0;
    let bestDist = Infinity;
    for (let b = 0; b <= a.map.width; b++) {
      const x =
        b === 0
          ? this.cellDom(a, 0, 0)!.getBoundingClientRect().left
          : this.cellDom(a, 0, b - 1)!.getBoundingClientRect().right;
      const d = Math.abs(clientX - x);
      if (d < bestDist) {
        bestDist = d;
        best = b;
      }
    }
    return best;
  }

  private nearestRowBoundary(a: Active, clientY: number): number {
    let best = 1;
    let bestDist = Infinity;
    for (let b = 1; b <= a.map.height; b++) {
      const y =
        b >= a.map.height
          ? this.cellDom(a, a.map.height - 1, 0)!.getBoundingClientRect().bottom
          : this.cellDom(a, b, 0)!.getBoundingClientRect().top;
      const d = Math.abs(clientY - y);
      if (d < bestDist) {
        bestDist = d;
        best = b;
      }
    }
    return best;
  }

  private showColDropLine(a: Active, boundary: number): void {
    const x =
      boundary === 0
        ? this.cellDom(a, 0, 0)!.getBoundingClientRect().left
        : this.cellDom(a, 0, boundary - 1)!.getBoundingClientRect().right;
    const top = this.cellDom(a, 0, 0)!.getBoundingClientRect().top;
    const bottom = this.cellDom(a, a.map.height - 1, 0)!.getBoundingClientRect().bottom;
    Object.assign(this.dropLine.style, {
      display: '',
      left: `${x - 1}px`,
      top: `${top}px`,
      width: '2px',
      height: `${bottom - top}px`
    });
  }

  private showRowDropLine(a: Active, boundary: number): void {
    const y =
      boundary >= a.map.height
        ? this.cellDom(a, a.map.height - 1, 0)!.getBoundingClientRect().bottom
        : this.cellDom(a, boundary, 0)!.getBoundingClientRect().top;
    const left = this.cellDom(a, 0, 0)!.getBoundingClientRect().left;
    const right = this.cellDom(a, 0, a.map.width - 1)!.getBoundingClientRect().right;
    Object.assign(this.dropLine.style, {
      display: '',
      left: `${left}px`,
      top: `${y - 1}px`,
      width: `${right - left}px`,
      height: '2px'
    });
  }

  private onDragUp(): void {
    const a = this.active;
    const drag = this.drag;
    const moved = this.moved;
    const select = this.pendingSelect;
    this.endDrag(); // clears drag/moved/pendingSelect — capture them first
    if (!a || !drag) return;
    if (!moved) {
      select?.(); // treat as a click → select the line
      return;
    }
    if (drag.target == null) return;
    const pos = this.cellPos(a, 0, 0); // any cell inside this table locates it for the move
    const cmd = drag.kind === 'col' ? moveTableColumn : moveTableRow;
    cmd({ from: drag.from, to: drag.target, pos })(this.view.state, this.view.dispatch);
    this.view.focus();
  }

  private endDrag(): void {
    this.drag = null;
    this.moved = false;
    this.pendingSelect = null;
    this.dropLine.style.display = 'none';
    document.body.classList.remove('omd-dragging-block');
    document.removeEventListener('mousemove', this.onDragMove, true);
    document.removeEventListener('mouseup', this.onDragUp, true);
    this.signature = ''; // force a rebuild — geometry changed
  }

  destroy(): void {
    this.endDrag();
    document.removeEventListener('mousemove', this.onHover);
    document.removeEventListener('scroll', this.onScroll, true);
    this.layer.remove();
  }
}

export const tableControlsPlugin = $prose(
  () =>
    new Plugin({
      key,
      view: (view) => {
        const controls = new TableControls(view);
        return { destroy: () => controls.destroy() };
      }
    })
);
