import type { EditorView } from 'prosemirror-view';
import { codicon } from '../../codicons';

/**
 * Shared media chrome — the resize handles, stock-size toolbar, alignment buttons, and inline
 * text editor used by both the image NodeViews (`view.ts`) and the YouTube block. Keeping it here
 * means an image and a video get exactly the same size/align/caption controls, and the alignment
 * always goes through the one `aligned` (`<div align>`) coexistence form.
 */

export type Align = 'left' | 'center' | 'right';
export const ALIGN_ICON: Record<Align, string> = {
  left: 'align-left',
  center: 'align-center',
  right: 'align-right'
};

/** Stock widths in px; drag snaps to the nearest within tolerance. Full maps to `100%`. */
export const STOCK_PX = [200, 400, 640] as const;
const SNAP_TOLERANCE = 16;

export function snapWidth(px: number, containerPx: number): string {
  if (px >= containerPx * 0.98) return '100%';
  for (const s of STOCK_PX) if (Math.abs(px - s) <= SNAP_TOLERANCE) return String(s);
  return String(Math.round(px));
}

type Corner = 'nw' | 'ne' | 'sw' | 'se';

export interface ChromeOpts {
  host: HTMLElement;
  /** The element whose width is being dragged (image or video frame). */
  target: HTMLElement;
  containerWidth: () => number;
  onCommit: (width: string) => void;
  onCaption?: () => void; // if set, adds a "Caption" button to the toolbar
  /** Include the S/M/L/Full stock-size buttons (default true). The sized-image view sets this
   *  false: its size/align/caption now live in the property panel, leaving only the drag handles. */
  stockSizes?: boolean;
}

/** Append 4 corner handles + a stock-size toolbar to `host`; return the readout + toolbar. */
export function buildResizeChrome(o: ChromeOpts): { readout: HTMLElement; toolbar: HTMLElement } {
  for (const corner of ['nw', 'ne', 'sw', 'se'] as Corner[]) {
    const h = document.createElement('span');
    h.className = `omd-img-handle omd-img-handle--${corner}`;
    h.addEventListener('mousedown', (e) => onHandleDown(e, corner, o));
    o.host.appendChild(h);
  }
  const bar = document.createElement('div');
  bar.className = 'omd-img-toolbar';
  if (o.stockSizes !== false) {
    const stock: Array<[string, string]> = [
      ['S', String(STOCK_PX[0])],
      ['M', String(STOCK_PX[1])],
      ['L', String(STOCK_PX[2])],
      ['Full', '100%']
    ];
    for (const [label, value] of stock) {
      const b = document.createElement('button');
      b.className = 'omd-img-size';
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', (e) => {
        e.preventDefault();
        o.onCommit(value);
      });
      bar.appendChild(b);
    }
  }
  if (o.onCaption) {
    const cap = document.createElement('button');
    cap.className = 'omd-img-size omd-img-caption-btn';
    cap.type = 'button';
    cap.textContent = 'Caption';
    cap.addEventListener('mousedown', (e) => e.preventDefault());
    cap.addEventListener('click', (e) => {
      e.preventDefault();
      o.onCaption?.();
    });
    bar.appendChild(cap);
  }
  const readout = document.createElement('span');
  readout.className = 'omd-img-readout';
  bar.appendChild(readout);
  o.host.appendChild(bar);
  return { readout, toolbar: bar };
}

function onHandleDown(e: MouseEvent, corner: Corner, o: ChromeOpts): void {
  e.preventDefault();
  e.stopPropagation();
  const startX = e.clientX;
  const startW = o.target.getBoundingClientRect().width;
  const container = o.containerWidth();
  const grow = corner === 'ne' || corner === 'se' ? 1 : -1;
  o.host.classList.add('omd-img--resizing');
  const readout = o.host.querySelector('.omd-img-readout');

  const onMove = (ev: MouseEvent): void => {
    const w = Math.max(40, Math.min(startW + grow * (ev.clientX - startX), container));
    o.target.style.width = `${Math.round(w)}px`;
    if (readout) readout.textContent = `${Math.round(w)}px`;
  };
  const onUp = (): void => {
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('mouseup', onUp, true);
    o.host.classList.remove('omd-img--resizing');
    const px = Math.round(o.target.getBoundingClientRect().width);
    o.onCommit(snapWidth(px, container));
  };
  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('mouseup', onUp, true);
}

export function containerWidthOf(dom: HTMLElement, fallback: HTMLElement): number {
  const parent = dom.parentElement?.getBoundingClientRect().width;
  return parent && parent > 0 ? parent : fallback.getBoundingClientRect().width;
}

export function applyWidth(el: HTMLElement, readout: HTMLElement, w: string | null): void {
  el.style.width = !w ? '' : /%$/.test(w) ? w : `${w}px`;
  readout.textContent = w ?? 'auto';
}

/** The handles/toolbar own their events; the media element itself defers to ProseMirror. */
export function chromeOwnsEvent(mediaEl: Element, event: Event): boolean {
  const t = event.target as HTMLElement;
  return t !== mediaEl && t.closest('.omd-img-handle, .omd-img-toolbar') != null;
}

/**
 * Append the L/C/R alignment buttons before `before` in `toolbar`. Returns a `setActive` that
 * highlights the current alignment (call it from the view's render()).
 */
export function addAlignButtons(
  toolbar: HTMLElement,
  before: HTMLElement,
  onAlign: (align: Align) => void
): (active: Align | null) => void {
  const sep = document.createElement('span');
  sep.className = 'omd-img-toolsep';
  toolbar.insertBefore(sep, before);
  const btns = new Map<Align, HTMLElement>();
  for (const align of ['left', 'center', 'right'] as Align[]) {
    const b = document.createElement('button');
    b.className = 'omd-img-align';
    b.type = 'button';
    b.title = `Align ${align}`;
    b.appendChild(codicon(ALIGN_ICON[align]));
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => {
      e.preventDefault();
      onAlign(align);
    });
    toolbar.insertBefore(b, before);
    btns.set(align, b);
  }
  return (active) => {
    for (const [align, btn] of btns) btn.classList.toggle('omd-img-align--active', align === active);
  };
}

/** The alignment of the `aligned` node wrapping the node at `pos`, or null if it isn't wrapped. */
export function alignOfPos(view: EditorView, pos: number): Align | null {
  const parent = view.state.doc.resolve(pos).parent;
  return parent.type.name === 'aligned' ? (parent.attrs.align as Align) : null;
}

/**
 * Set/toggle alignment of the block at `pos` by wrapping it in an `aligned` node (`<div align>`),
 * re-marking that wrapper, or unwrapping when the active alignment is chosen again. Works for any
 * block node (image or shortcode container), so images and videos align identically.
 */
export function setAlignAtPos(view: EditorView, pos: number, align: Align): void {
  const $pos = view.state.doc.resolve(pos);
  const depth = $pos.depth;
  const parent = $pos.parent;
  const alignedType = view.state.schema.nodes.aligned;
  const tr = view.state.tr;
  if (parent.type.name === 'aligned') {
    const from = $pos.before(depth);
    const to = $pos.after(depth);
    if (parent.attrs.align === align) tr.replaceWith(from, to, parent.child(0));
    else tr.setNodeMarkup(from, undefined, { ...parent.attrs, align, openRaw: `<div align="${align}">` });
  } else {
    const node = view.state.doc.nodeAt(pos);
    if (!node) return;
    const wrapped = alignedType.create(
      { align, openRaw: `<div align="${align}">`, closeRaw: '</div>' },
      node
    );
    tr.replaceWith(pos, pos + node.nodeSize, wrapped);
  }
  view.dispatch(tr);
  view.focus();
}

/**
 * Set the alignment of the block at `pos` to an absolute value (never toggling): `null` unwraps
 * any `aligned` wrapper, a direction wraps (or re-marks) it. This is the property-panel counterpart
 * to `setAlignAtPos` (which toggles for the on-canvas buttons); the panel needs an idempotent set
 * so re-applying the same value on every auto-apply is a no-op. `pos` is the inner block's position,
 * which is stable across wrap/unwrap because the `aligned` node replaces the range at the same start.
 */
export function setAlignAbsolute(view: EditorView, pos: number, align: Align | null): void {
  const $pos = view.state.doc.resolve(pos);
  const parent = $pos.parent;
  const tr = view.state.tr;
  const alignedType = view.state.schema.nodes.aligned;
  if (parent.type.name === 'aligned') {
    const from = $pos.before($pos.depth);
    const to = $pos.after($pos.depth);
    if (align === null) tr.replaceWith(from, to, parent.child(0)); // unwrap
    else if (parent.attrs.align !== align)
      tr.setNodeMarkup(from, undefined, { ...parent.attrs, align, openRaw: `<div align="${align}">` });
    else return; // already this alignment
  } else {
    if (align === null) return; // already unaligned
    const node = view.state.doc.nodeAt(pos);
    if (!node) return;
    tr.replaceWith(
      pos,
      pos + node.nodeSize,
      alignedType.create({ align, openRaw: `<div align="${align}">`, closeRaw: '</div>' }, node)
    );
  }
  view.dispatch(tr);
  view.focus();
}

/**
 * A minimal inline text editor over an element: make it editable, select all, and commit on
 * Enter/blur or cancel on Escape. The caller owns any surrounding state (an `editing` flag, the
 * post-edit re-render) via the callbacks.
 */
export function inlineEdit(
  el: HTMLElement,
  opts: { editingClass?: string; onCommit: (text: string) => void; onCancel?: () => void; onEnd?: () => void }
): void {
  el.contentEditable = 'true';
  if (opts.editingClass) el.classList.add(opts.editingClass);
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);

  const end = (commit: boolean): void => {
    el.removeEventListener('blur', onBlur);
    el.removeEventListener('keydown', onKey);
    el.contentEditable = 'false';
    if (opts.editingClass) el.classList.remove(opts.editingClass);
    if (commit) opts.onCommit((el.textContent ?? '').trim());
    else opts.onCancel?.();
    opts.onEnd?.();
  };
  const onBlur = (): void => end(true);
  const onKey = (e: KeyboardEvent): void => {
    // Keep keystrokes out of ProseMirror's keymap while this field has focus — otherwise PM
    // handles Backspace/Delete/arrows as document commands and preventDefaults them, so the
    // field's own native editing never happens.
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      end(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      end(false);
    }
  };
  el.addEventListener('blur', onBlur);
  el.addEventListener('keydown', onKey);
}
