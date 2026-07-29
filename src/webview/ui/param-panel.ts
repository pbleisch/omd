import { codicon } from '../codicons';
import { openFloating, type FloatingAnchor, type FloatingHandle } from './floating';
import { createField, type FieldControl, type FieldType, type Segment } from './fields';

/**
 * The block property panel (Phase 2): a multi-field floating form pinned below a smart
 * block, built from the block's typed param definitions. It reuses the Phase 0 primitives
 * end to end — `floating.ts` for anchoring/dismissal, `fields.ts` for the typed controls —
 * so this file is only the form's shell (header, field stack, Apply) and value collection.
 * Exactly one panel is open at a time.
 */

export interface ParamFieldSpec {
  /** Params key the value is stored under. */
  name: string;
  label: string;
  type: FieldType;
  value?: unknown;
  options?: string[];
  /** Buttons for a `segmented` field. */
  segments?: Segment[];
}

export interface ParamPanelOptions {
  title: string;
  icon?: string;
  fields: ParamFieldSpec[];
  anchor: FloatingAnchor;
  /** Fix the panel to this width in px (e.g. to match the block it edits). */
  width?: number;
  /** Field names that must be non-empty before Apply is enabled (insert-time required params). */
  requiredFields?: string[];
  /** Apply button text (defaults to "Apply"). */
  applyLabel?: string;
  /** Commit each field change immediately (no Apply button) — for editing existing blocks. */
  autoApply?: boolean;
  /** Re-anchor on scroll/resize; return null to close (block scrolled away or removed). */
  reposition?: () => FloatingAnchor | null;
  /** Called with the collected `{ name: value }` map when the user applies. */
  onApply: (values: Record<string, unknown>) => void;
}

let current: FloatingHandle | null = null;

/**
 * The narrowest the panel may get when matched to a block's width. A small block (a 240px image, a
 * broken-image box) would otherwise squeeze the header and field rows; the panel floats freely, so
 * it needn't shrink to the block — it just aligns with it when the block is wide enough.
 */
const MIN_PANEL_WIDTH = 300;

export function closeParamPanel(): void {
  current?.close();
  current = null;
}

/** Whether a property panel is currently mounted (used by the hover controller). */
export function isParamPanelOpen(): boolean {
  return current !== null;
}

export function openParamPanel(opts: ParamPanelOptions): FloatingHandle {
  closeParamPanel();

  const panel = document.createElement('div');
  panel.className = 'omd-param-panel';
  // Match the block's width when asked, but never below a usable minimum (a narrow block must not
  // squeeze the panel), overriding the default min/max clamp.
  if (opts.width && opts.width > 0) {
    panel.style.width = `${Math.max(Math.round(opts.width), MIN_PANEL_WIDTH)}px`;
    panel.style.minWidth = '0';
    panel.style.maxWidth = 'none';
  }

  // Header: icon + title + close.
  const header = document.createElement('div');
  header.className = 'omd-param-panel-header';
  if (opts.icon) header.appendChild(codicon(opts.icon));
  const titleEl = document.createElement('span');
  titleEl.className = 'omd-param-panel-title';
  titleEl.textContent = opts.title;
  header.appendChild(titleEl);
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'omd-param-panel-close';
  closeBtn.title = 'Close';
  closeBtn.appendChild(codicon('close'));
  closeBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    closeParamPanel();
  });
  header.appendChild(closeBtn);
  panel.appendChild(header);

  const required = new Set(opts.requiredFields ?? []);
  const autoApply = opts.autoApply === true;

  const gather = (): Record<string, unknown> => {
    const values: Record<string, unknown> = {};
    for (const [name, control] of controls) values[name] = control.getValue();
    return values;
  };

  /** Every required field has a non-empty value. */
  const isComplete = (): boolean => {
    for (const name of required) {
      const v = controls.get(name)?.getValue();
      if (v == null || String(v).trim() === '') return false;
    }
    return true;
  };

  // A field changed: in auto-apply mode commit live (each edit is its own undoable
  // transaction); otherwise just refresh the required-field gate.
  const onFieldChange = (): void => {
    if (autoApply) {
      if (isComplete()) opts.onApply(gather());
    }
    if (required.size) applyBtn.disabled = !isComplete();
  };

  // Body: one typed control per field, keyed by param name.
  const body = document.createElement('div');
  body.className = 'omd-param-panel-body';
  const controls = new Map<string, FieldControl>();
  for (const spec of opts.fields) {
    const control = createField({
      type: spec.type,
      label: spec.label,
      value: spec.value,
      options: spec.options,
      segments: spec.segments,
      onChange: autoApply || required.size ? () => onFieldChange() : undefined
    });
    controls.set(spec.name, control);
    body.appendChild(control.el);
  }
  panel.appendChild(body);

  const apply = () => {
    if (!isComplete()) return;
    closeParamPanel();
    opts.onApply(gather());
  };

  // Enter commits: closes in auto-apply mode (edits already applied), else applies.
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (autoApply) closeParamPanel();
      else apply();
    }
  });

  // Footer: an explicit Apply/Insert button — only when not auto-applying.
  const applyBtn = document.createElement('button');
  if (!autoApply) {
    const footer = document.createElement('div');
    footer.className = 'omd-param-panel-footer';
    applyBtn.type = 'button';
    applyBtn.className = 'omd-param-panel-apply';
    applyBtn.textContent = opts.applyLabel ?? 'Apply';
    applyBtn.disabled = !isComplete();
    applyBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      apply();
    });
    footer.appendChild(applyBtn);
    panel.appendChild(footer);
  }

  current = openFloating({
    anchor: opts.anchor,
    content: panel,
    offset: 6,
    reposition: opts.reposition,
    onDismiss: () => {
      current = null;
    }
  });

  // Focus the first field so the panel is keyboard-ready.
  const first = controls.values().next().value as FieldControl | undefined;
  first?.focus();

  return current;
}
