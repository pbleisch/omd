/**
 * Typed field renderers (Phase 0). Each returns a labeled control that knows how to read
 * its own value back with the right JS type. The block property panel (Phase 2) and the
 * front-matter panel (Phase 8) both build their forms from this one map, so a param's
 * declared `type` maps to exactly one editor everywhere.
 *
 * This is deliberately DOM-only and framework-free: a `FieldSpec` in, a `{ el, getValue,
 * focus }` control out. The MVP covers the common param kinds; new types are additive.
 */

import { codicon } from '../codicons';

export type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'segmented'
  | 'width'
  | 'color'
  | 'date'
  | 'list';

/** One choice in a `segmented` control: a value plus an icon (codicon name) or a short label. */
export interface Segment {
  value: string;
  label?: string;
  icon?: string;
  title?: string;
}

export interface FieldSpec {
  type: FieldType;
  label: string;
  value?: unknown;
  /** Choices for `enum`. Ignored by other types. */
  options?: string[];
  /** Buttons for `segmented`. Ignored by other types. */
  segments?: Segment[];
  placeholder?: string;
  /** Called when the control's value changes (used by live editors like the inspector). */
  onChange?: () => void;
}

export interface FieldControl {
  /** A `.omd-field` row: label + input. */
  el: HTMLElement;
  /** The current value, typed per the field's kind (`list` yields a string array). */
  getValue(): string | number | boolean | string[];
  focus(): void;
}

function row(label: string, input: HTMLElement): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'omd-field';
  const name = document.createElement('span');
  name.className = 'omd-field-label';
  name.textContent = label;
  wrap.append(name, input);
  return wrap;
}

function textLike(spec: FieldSpec, inputType: 'text' | 'number' | 'color' | 'date'): {
  el: HTMLElement;
  input: HTMLInputElement;
} {
  const input = document.createElement('input');
  input.type = inputType;
  input.className = 'omd-field-input';
  if (spec.placeholder) input.placeholder = spec.placeholder;
  if (spec.value != null) input.value = String(spec.value);
  return { el: row(spec.label, input), input };
}

/** Fire the spec's onChange when an element emits `event`. */
function onChangeOf(el: HTMLElement, event: string, spec: FieldSpec): void {
  if (spec.onChange) el.addEventListener(event, () => spec.onChange!());
}

export function createField(spec: FieldSpec): FieldControl {
  switch (spec.type) {
    case 'number': {
      const { el, input } = textLike(spec, 'number');
      onChangeOf(input, 'change', spec);
      return {
        el,
        getValue: () => {
          const n = Number(input.value);
          return Number.isFinite(n) ? n : 0;
        },
        focus: () => input.focus()
      };
    }
    case 'boolean': {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'omd-field-checkbox';
      input.checked = spec.value === true || spec.value === 'true';
      onChangeOf(input, 'change', spec);
      return {
        el: row(spec.label, input),
        getValue: () => input.checked,
        focus: () => input.focus()
      };
    }
    case 'enum': {
      const select = document.createElement('select');
      select.className = 'omd-field-input';
      for (const opt of spec.options ?? []) {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        select.appendChild(o);
      }
      if (spec.value != null) select.value = String(spec.value);
      onChangeOf(select, 'change', spec);
      return {
        el: row(spec.label, select),
        getValue: () => select.value,
        focus: () => select.focus()
      };
    }
    case 'segmented':
      return createSegmentedField(spec);
    case 'width':
      return createWidthField(spec);
    case 'color': {
      const { el, input } = textLike(spec, 'color');
      if (spec.value == null) input.value = '#000000';
      onChangeOf(input, 'change', spec);
      return { el, getValue: () => input.value, focus: () => input.focus() };
    }
    case 'date': {
      const { el, input } = textLike(spec, 'date');
      onChangeOf(input, 'change', spec);
      return { el, getValue: () => input.value, focus: () => input.focus() };
    }
    case 'list':
      return createListField(spec);
    case 'string':
    default: {
      const { el, input } = textLike(spec, 'text');
      onChangeOf(input, 'change', spec);
      return { el, getValue: () => input.value, focus: () => input.focus() };
    }
  }
}

/**
 * A single-choice button group (Width S/M/L/Full, Align L/C/R). Clicking a button selects it;
 * clicking the already-active button clears the selection (so alignment can be removed). Each
 * segment shows an icon or a short label. `getValue` returns the selected segment's value, or the
 * empty string when nothing is selected — which is how a "no alignment / custom width" state, or
 * an initial value that matches no button, round-trips without being clobbered.
 */
function createSegmentedField(spec: FieldSpec): FieldControl {
  let current = spec.value == null ? '' : String(spec.value);

  const group = document.createElement('div');
  group.className = 'omd-field-seg';
  const buttons = new Map<string, HTMLButtonElement>();

  const paint = (): void => {
    for (const [value, btn] of buttons) btn.classList.toggle('omd-seg--active', value === current);
  };

  for (const seg of spec.segments ?? []) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'omd-seg';
    if (seg.title) b.title = seg.title;
    if (seg.icon) b.appendChild(codicon(seg.icon));
    else b.textContent = seg.label ?? seg.value;
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => {
      e.preventDefault();
      current = current === seg.value ? '' : seg.value;
      paint();
      spec.onChange?.();
    });
    buttons.set(seg.value, b);
    group.appendChild(b);
  }
  paint();

  return {
    el: row(spec.label, group),
    getValue: () => current,
    // No autofocus: a focus ring on the first button reads as a selection, which is misleading
    // when nothing is actually selected (e.g. a custom width matching no stock size).
    focus: () => {}
  };
}

/**
 * Normalize a typed dimension to the stored form: a bare number is px (`"500"` → `"500"`, and so
 * is `"500px"`), a percent keeps its unit (`"80%"` → `"80%"`), and anything unparseable (or empty)
 * becomes `""` (auto / no explicit width). This is what lets the Width input accept `500`, `500px`,
 * or `80%` interchangeably with px as the default unit.
 */
export function normalizeWidth(raw: unknown): string {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return '';
  const isPct = s.endsWith('%');
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n <= 0) return '';
  return isPct ? `${n}%` : String(n);
}

/**
 * The Width control: the stock-size buttons (S/M/L/Full, a `segmented`-style group) plus a free
 * text input for a specific value — `500`, `500px`, or `80%`, px being the default unit. The two
 * stay in sync: picking a stock fills the input and highlights the button; typing a value that
 * matches no stock leaves every button inactive. `getValue` returns the normalized stored form.
 */
function createWidthField(spec: FieldSpec): FieldControl {
  let current = normalizeWidth(spec.value);

  const box = document.createElement('div');
  box.className = 'omd-field-width';

  const group = document.createElement('div');
  group.className = 'omd-field-seg';
  const buttons = new Map<string, HTMLButtonElement>();

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'omd-field-input omd-field-widthinput';
  input.placeholder = 'px';

  const paint = (): void => {
    for (const [value, btn] of buttons) btn.classList.toggle('omd-seg--active', value === current);
    if (document.activeElement !== input) input.value = current;
  };

  for (const seg of spec.segments ?? []) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'omd-seg';
    if (seg.title) b.title = seg.title;
    b.textContent = seg.label ?? seg.value;
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => {
      e.preventDefault();
      current = current === seg.value ? '' : seg.value;
      paint();
      spec.onChange?.();
    });
    buttons.set(seg.value, b);
    group.appendChild(b);
  }

  const commitInput = (): void => {
    const next = normalizeWidth(input.value);
    if (next === current) {
      input.value = current; // re-canonicalize what they typed (e.g. "500px" → "500")
      return;
    }
    current = next;
    paint();
    spec.onChange?.();
  };
  input.addEventListener('change', commitInput);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitInput();
    }
  });

  box.append(group, input);
  paint();

  return {
    el: row(spec.label, box),
    getValue: () => current,
    focus: () => {}
  };
}

/**
 * An editable list rendered as removable tag pills, with a dashed "Add…" pill for new items —
 * which is just the input itself (placeholder "Add…"), so clicking it focuses natively with no
 * show/hide dance to fight ProseMirror's focus. Enter or comma commits a pill, Backspace on an
 * empty input removes the last, and the × on a pill removes it; blur commits pending text.
 * `getValue` returns the current pills as a string array.
 */
function createListField(spec: FieldSpec): FieldControl {
  const pills: string[] = Array.isArray(spec.value) ? spec.value.map((v) => String(v)) : [];

  const box = document.createElement('div');
  box.className = 'omd-field-list';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'omd-field-listinput';
  input.placeholder = spec.placeholder ?? 'Add…';
  input.size = 6; // compact, so the "Add…" pill sits inline after the tags rather than wrapping

  const notify = () => spec.onChange?.();

  const renderPills = (): void => {
    box.querySelectorAll('.omd-pill-item').forEach((p) => p.remove());
    pills.forEach((text, i) => {
      const pill = document.createElement('span');
      pill.className = 'omd-pill omd-pill-item';
      const t = document.createElement('span');
      t.textContent = text;
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'omd-pill-remove';
      rm.textContent = '×';
      rm.addEventListener('mousedown', (e) => {
        e.preventDefault();
        pills.splice(i, 1);
        renderPills();
        notify();
      });
      pill.append(t, rm);
      box.insertBefore(pill, input);
    });
  };

  const commit = (): void => {
    const v = input.value.trim();
    if (v && !pills.includes(v)) {
      pills.push(v);
      renderPills();
      notify();
    }
    input.value = '';
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && input.value === '' && pills.length) {
      pills.pop();
      renderPills();
      notify();
    }
  });
  input.addEventListener('blur', commit);

  box.appendChild(input);
  renderPills();

  return {
    el: row(spec.label, box),
    getValue: () => [...pills],
    focus: () => input.focus()
  };
}
