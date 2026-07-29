import { codicon } from '../codicons';
import { openFloating, type FloatingHandle } from './floating';

/**
 * A small floating single-field popover for editing a block parameter (docs/design/STYLE.md —
 * floating param panels: anchor to the cursor/selection, float over the editor, dismiss
 * on outside click or Escape). Exactly one is open at a time. Committing runs `onCommit`;
 * this is the surface that turns "edit a parameter" into a promotion.
 *
 * The anchoring/flip/dismiss lifecycle lives in `floating.ts`; this file is just the
 * single-input body that hangs inside it.
 */

export interface PopoverSuggestion {
  label: string;
  detail?: string;
  /** The value the input takes when this suggestion is chosen. */
  value: string;
}

interface PopoverOptions {
  /** Viewport coordinates to anchor near (e.g. `view.coordsAtPos(pos)`). */
  anchor: { left: number; bottom: number };
  label: string;
  value: string;
  onCommit: (value: string) => void;
  /** Optional autocomplete: given the current input, return matching suggestions (e.g. heading
   * anchors when the value starts with `#`). */
  suggest?: (value: string) => PopoverSuggestion[];
}

let current: FloatingHandle | null = null;

export function closeParamPopover(): void {
  current?.close();
  current = null;
}

export function openParamPopover(opts: PopoverOptions): void {
  closeParamPopover();

  const content = document.createElement('div');
  content.className = 'omd-popover';

  const label = document.createElement('label');
  label.className = 'omd-popover-label';
  label.textContent = opts.label;

  const row = document.createElement('div');
  row.className = 'omd-popover-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'omd-popover-input';
  input.value = opts.value;
  const ok = document.createElement('button');
  ok.type = 'button';
  ok.className = 'omd-popover-ok';
  ok.title = 'Apply';
  ok.appendChild(codicon('check'));
  row.append(input, ok);

  content.append(label, row);

  // Optional autocomplete list (e.g. heading anchors).
  const list = document.createElement('div');
  list.className = 'omd-popover-suggest';
  list.style.display = 'none';
  content.appendChild(list);
  let items: PopoverSuggestion[] = [];
  let selected = 0;

  current = openFloating({
    anchor: { left: opts.anchor.left, top: opts.anchor.bottom, bottom: opts.anchor.bottom },
    content,
    offset: 6,
    onDismiss: () => {
      current = null;
    }
  });
  input.focus();
  input.select();

  const commit = () => {
    const value = input.value;
    closeParamPopover();
    opts.onCommit(value);
  };

  const renderSuggest = () => {
    items = opts.suggest ? opts.suggest(input.value) : [];
    if (items.length === 0) {
      list.style.display = 'none';
      list.replaceChildren();
      return;
    }
    if (selected >= items.length) selected = items.length - 1;
    list.style.display = '';
    list.replaceChildren(
      ...items.map((it, i) => {
        const row = document.createElement('div');
        row.className = 'omd-popover-suggest-item' + (i === selected ? ' omd-popover-suggest-item--active' : '');
        const lbl = document.createElement('span');
        lbl.className = 'omd-popover-suggest-label';
        lbl.textContent = it.label;
        row.appendChild(lbl);
        if (it.detail) {
          const det = document.createElement('span');
          det.className = 'omd-popover-suggest-detail';
          det.textContent = it.detail;
          row.appendChild(det);
        }
        row.addEventListener('mousedown', (e) => {
          e.preventDefault();
          input.value = it.value;
          commit();
        });
        return row;
      })
    );
  };

  const applySelected = (): boolean => {
    if (list.style.display === 'none' || !items[selected]) return false;
    input.value = items[selected].value;
    commit();
    return true;
  };

  input.addEventListener('input', () => {
    selected = 0;
    renderSuggest();
  });
  input.addEventListener('keydown', (e) => {
    if (list.style.display !== 'none' && items.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selected = (selected + 1) % items.length;
        renderSuggest();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        selected = (selected - 1 + items.length) % items.length;
        renderSuggest();
        return;
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!applySelected()) commit();
    }
    // Escape is handled by the floating layer's dismiss.
  });
  ok.addEventListener('mousedown', (e) => {
    e.preventDefault();
    commit();
  });
  renderSuggest(); // seed (e.g. if the initial value already starts with `#`)
}
