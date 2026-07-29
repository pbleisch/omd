import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorState, Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { Node as ProseNode } from 'prosemirror-model';
import { DATE_TOKEN, formatDateToken } from '../blocks/date';
import { toIsoDate } from '../../shared/dates';

/**
 * Decorate the bare `📅 YYYY-MM-DD` token as a date chip, and let a click on the chip open a
 * calendar popover that writes the chosen date back into the token. This is the `date` block's
 * *native* form (docs/design/FORMATS.md): real text a plain reader still understands, styled by OMD
 * rather than replaced with machinery. The decoration never edits the document; only a deliberate
 * pick does — one act on the object (Principle 3), the same discipline as the task-list checkbox.
 *
 * The picker is a hand-rolled calendar, not `<input type="date">.showPicker()`: VS Code webviews
 * run in a sandboxed cross-origin iframe, where `showPicker()` throws a SecurityError. Our own
 * popover has no such restriction and renders identically in the browser preview harness.
 */
function buildDecorations(doc: ProseNode): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return true;
    DATE_TOKEN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = DATE_TOKEN.exec(node.text))) {
      decos.push(
        Decoration.inline(pos + m.index, pos + m.index + m[0].length, { class: 'omd-date-chip' })
      );
    }
    return true;
  });
  return DecorationSet.create(doc, decos);
}

/**
 * The token `📅 YYYY-MM-DD` covering document position `pos`, or null. Token positions are computed
 * exactly as the decoration does (JS-string indices into the text node), so `from`/`to` line up with
 * the chip's span. Exported for tests.
 */
export function dateTokenAt(
  doc: ProseNode,
  pos: number
): { from: number; to: number; iso: string } | null {
  let hit: { from: number; to: number; iso: string } | null = null;
  doc.descendants((node, nodePos) => {
    if (hit || !node.isText || !node.text) return true;
    DATE_TOKEN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = DATE_TOKEN.exec(node.text))) {
      const from = nodePos + m.index;
      const to = from + m[0].length;
      if (pos >= from && pos <= to) {
        hit = { from, to, iso: m[1] };
        return false;
      }
    }
    return true;
  });
  return hit;
}

/** Replace the token spanning `[from, to)` with `📅 <iso>`. Exported for tests. */
export function setDateAt(state: EditorState, from: number, to: number, iso: string): Transaction {
  return state.tr.insertText(formatDateToken(iso), from, to);
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/** Parse `YYYY-MM-DD` into calendar parts (month 0-based), or null. */
function parseIso(iso: string): { y: number; m: number } | null {
  const g = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return g ? { y: Number(g[1]), m: Number(g[2]) - 1 } : null;
}

export interface DatePickerHandle {
  destroy: () => void;
}

/** The one open picker, so a second open (or a document click) dismisses the first. */
let activePicker: DatePickerHandle | null = null;

/**
 * Open a calendar popover anchored under `rect`, seeded with `selectedIso`, calling `onPick` with the
 * chosen `YYYY-MM-DD`. Exported for tests. Dismisses on outside-click, Escape, or picking a day.
 */
export function createDatePicker(
  rect: { left: number; bottom: number; top: number },
  selectedIso: string,
  onPick: (iso: string) => void
): DatePickerHandle {
  activePicker?.destroy();

  const start = parseIso(selectedIso);
  const now = new Date();
  let viewY = start?.y ?? now.getFullYear();
  let viewM = start?.m ?? now.getMonth();

  const pop = document.createElement('div');
  pop.className = 'omd-date-picker';
  pop.style.position = 'fixed';
  document.body.appendChild(pop);

  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    document.removeEventListener('mousedown', onDocDown, true);
    document.removeEventListener('keydown', onKey, true);
    pop.remove();
    if (activePicker === handle) activePicker = null;
  };
  const handle: DatePickerHandle = { destroy };

  const position = () => {
    const gap = 4;
    let left = rect.left;
    let top = rect.bottom + gap;
    if (left + pop.offsetWidth > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - 8 - pop.offsetWidth);
    }
    if (top + pop.offsetHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - gap - pop.offsetHeight); // flip above the chip
    }
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  };

  const render = () => {
    pop.replaceChildren();

    const header = document.createElement('div');
    header.className = 'omd-date-picker-header';
    const prev = navButton('‹', 'Previous month', () => {
      viewM -= 1;
      if (viewM < 0) { viewM = 11; viewY -= 1; }
      render();
    });
    const next = navButton('›', 'Next month', () => {
      viewM += 1;
      if (viewM > 11) { viewM = 0; viewY += 1; }
      render();
    });
    const label = document.createElement('span');
    label.className = 'omd-date-picker-label';
    label.textContent = `${MONTHS[viewM]} ${viewY}`;
    header.append(prev, label, next);
    pop.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'omd-date-picker-grid';
    for (const w of WEEKDAYS) {
      const wd = document.createElement('span');
      wd.className = 'omd-date-picker-weekday';
      wd.textContent = w;
      grid.appendChild(wd);
    }
    const firstDow = new Date(viewY, viewM, 1).getDay();
    const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
    for (let i = 0; i < firstDow; i++) grid.appendChild(document.createElement('span'));
    const todayIso = toIsoDate(now);
    for (let d = 1; d <= daysInMonth; d++) {
      const cellIso = toIsoDate(new Date(viewY, viewM, d));
      const day = document.createElement('button');
      day.type = 'button';
      day.className = 'omd-date-picker-day';
      day.textContent = String(d);
      if (cellIso === selectedIso) day.classList.add('is-selected');
      if (cellIso === todayIso) day.classList.add('is-today');
      day.addEventListener('click', () => {
        onPick(cellIso);
        destroy();
      });
      grid.appendChild(day);
    }
    pop.appendChild(grid);
    position();
  };

  const onDocDown = (e: MouseEvent) => {
    if (!pop.contains(e.target as Node)) destroy();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); destroy(); }
  };
  // Attach on the next tick so the click that opened the picker doesn't immediately close it.
  setTimeout(() => {
    if (!destroyed) document.addEventListener('mousedown', onDocDown, true);
  }, 0);
  document.addEventListener('keydown', onKey, true);

  activePicker = handle;
  render();
  return handle;
}

function navButton(glyph: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'omd-date-picker-nav';
  b.textContent = glyph;
  b.setAttribute('aria-label', label);
  b.addEventListener('click', onClick);
  return b;
}

const key = new PluginKey('omd-date-token');

export const dateTokenPlugin = $prose(
  () =>
    new Plugin({
      key,
      props: {
        decorations(state) {
          return buildDecorations(state.doc);
        }
      },
      view(view: EditorView) {
        const onMouseDown = (event: MouseEvent) => {
          if (event.button !== 0) return;
          const chip = (event.target as HTMLElement | null)?.closest('.omd-date-chip') as
            | HTMLElement
            | null;
          if (!chip) return;
          const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (!coords) return;
          const token = dateTokenAt(view.state.doc, coords.pos);
          if (!token) return;

          event.preventDefault(); // clicking the chip picks a date; it doesn't place the cursor
          createDatePicker(chip.getBoundingClientRect(), token.iso, (iso) => {
            if (iso === token.iso) return;
            view.dispatch(setDateAt(view.state, token.from, token.to, iso));
            view.focus();
          });
        };
        view.dom.addEventListener('mousedown', onMouseDown);
        return {
          destroy() {
            view.dom.removeEventListener('mousedown', onMouseDown);
            activePicker?.destroy();
          }
        };
      }
    })
);
