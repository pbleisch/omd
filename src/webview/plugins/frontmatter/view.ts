import { $view } from '@milkdown/utils';
import type { NodeView } from 'prosemirror-view';
import type { Node as ProseNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import yaml from 'js-yaml';
import { codicon } from '../../codicons';
import { frontmatterSchema } from './schema';
import { createField, type FieldControl, type FieldType } from '../../ui/fields';

/**
 * NodeView for YAML front matter as an inline property inspector (Phase 6). The block header
 * carries a Fields/Source toggle — the smart-block pattern the chart uses — where Fields is
 * the same typed editor as the floating param panel, only docked in the block body, and
 * Source is the raw YAML. Edits re-dump the YAML into the node's `value` attr (a real edit,
 * not a round-trip concern); lists and nested maps are shown read-only and preserved.
 *
 * Writing back triggers our own `update`, so a self-edit skips the re-render (the `applying`
 * guard) — otherwise rebuilding the form mid-edit would steal focus from the field.
 */

type Mode = 'fields' | 'source';

function parse(value: string): Record<string, unknown> | null {
  try {
    const obj = yaml.load(value);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The YAML parse error for `value`, or null when it's valid — the inline invalid-front-matter check. */
function yamlError(value: string): string | null {
  try {
    yaml.load(value);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message.split('\n')[0] : String(err);
  }
}

function scalarType(v: unknown): FieldType | null {
  if (typeof v === 'string') return 'string';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  return null;
}

/** A list whose every item is a scalar — editable as tag pills. */
function isScalarArray(v: unknown): v is unknown[] {
  return Array.isArray(v) && v.every((x) => scalarType(x) !== null);
}

/** A compact one-line rendering of a non-scalar value, for its read-only row. */
function summarize(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => String(x)).join(', ');
  return JSON.stringify(v);
}

class FrontmatterView implements NodeView {
  dom: HTMLElement;
  private mode: Mode = 'fields';
  private applying = false;
  private data: Record<string, unknown> | null = null;
  private controls = new Map<string, FieldControl>();

  constructor(
    private node: ProseNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined
  ) {
    this.dom = document.createElement('div');
    this.dom.className = 'omd-frontmatter';
    this.dom.contentEditable = 'false';
    this.render();
  }

  private render(): void {
    this.controls.clear();
    this.dom.replaceChildren(this.buildHeader());
    // Invalid YAML is flagged inline (the Problems-panel replacement): an error banner under the
    // header, plus a class the CSS uses to tint the block. Fields mode can't build from unparseable
    // YAML, so an error forces the Source view where the writer can fix it.
    const error = yamlError(String(this.node.attrs.value ?? ''));
    this.dom.classList.toggle('omd-frontmatter--error', error !== null);
    if (error) {
      this.dom.appendChild(this.buildErrorBanner(error));
      this.dom.appendChild(this.buildSource());
      return;
    }
    this.dom.appendChild(this.mode === 'fields' ? this.buildFields() : this.buildSource());
  }

  private buildErrorBanner(message: string): HTMLElement {
    const banner = document.createElement('div');
    banner.className = 'omd-frontmatter-error';
    banner.append(codicon('warning'));
    const text = document.createElement('span');
    text.textContent = `Front matter is not valid YAML: ${message}`;
    banner.appendChild(text);
    return banner;
  }

  private buildHeader(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'omd-block-header';

    const left = document.createElement('span');
    left.className = 'omd-block-name';
    left.append(codicon('settings-gear'));
    const label = document.createElement('span');
    label.textContent = 'Front matter';
    left.appendChild(label);

    const tabs = document.createElement('span');
    tabs.className = 'omd-block-tabs';
    for (const m of ['fields', 'source'] as Mode[]) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'omd-block-tab' + (m === this.mode ? ' omd-block-tab--active' : '');
      btn.textContent = m === 'fields' ? 'Fields' : 'Source';
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (this.mode !== m) {
          this.mode = m;
          this.render();
        }
      });
      tabs.appendChild(btn);
    }

    bar.append(left, tabs);
    return bar;
  }

  private buildFields(): HTMLElement {
    const value = String(this.node.attrs.value ?? '');
    this.data = parse(value);
    if (!this.data) {
      // Not a simple mapping — fall back to showing the raw YAML rather than risk mangling it.
      return this.buildSource();
    }

    const form = document.createElement('div');
    form.className = 'omd-frontmatter-form';
    const onChange = () => this.writeFromFields();
    for (const [key, val] of Object.entries(this.data)) {
      const type = scalarType(val);
      if (type) {
        const control = createField({ type, label: key, value: val, onChange });
        this.controls.set(key, control);
        form.appendChild(control.el);
      } else if (isScalarArray(val)) {
        const control = createField({ type: 'list', label: key, value: val.map((v) => String(v)), onChange });
        this.controls.set(key, control);
        form.appendChild(control.el);
      } else {
        // Nested maps / lists of objects stay read-only (and are preserved on write).
        const row = document.createElement('label');
        row.className = 'omd-field';
        const name = document.createElement('span');
        name.className = 'omd-field-label';
        name.textContent = key;
        const ro = document.createElement('span');
        ro.className = 'omd-frontmatter-readonly';
        ro.textContent = summarize(val);
        row.append(name, ro);
        form.appendChild(row);
      }
    }
    return form;
  }

  private buildSource(): HTMLElement {
    const area = document.createElement('textarea');
    area.className = 'omd-frontmatter-source';
    area.spellcheck = false;
    area.value = String(this.node.attrs.value ?? '');
    area.rows = Math.min(12, Math.max(2, area.value.split('\n').length));
    area.addEventListener('change', () => this.writeValue(area.value));
    return area;
  }

  private writeFromFields(): void {
    if (!this.data) return;
    const next: Record<string, unknown> = { ...this.data };
    for (const [key, control] of this.controls) next[key] = control.getValue();
    this.writeValue(yaml.dump(next).replace(/\n$/, ''));
  }

  private writeValue(value: string): void {
    const pos = this.getPos();
    if (pos == null) return;
    this.applying = true;
    this.view.dispatch(
      this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, value })
    );
  }

  update(node: ProseNode): boolean {
    if (node.type !== this.node.type) return false;
    const changed = node.attrs.value !== this.node.attrs.value;
    this.node = node;
    // Our own edit: the DOM already reflects it, so don't rebuild and steal field focus.
    if (this.applying) {
      this.applying = false;
      return true;
    }
    if (changed) this.render();
    return true;
  }

  ignoreMutation(): boolean {
    return true; // atom chrome + form controls; nothing here is ProseMirror content
  }

  /**
   * Keep ProseMirror out of our form. Without this, clicking an input also node-selects the
   * atom, and the first keystroke types *over* the selection — replacing the whole block. By
   * claiming every event inside our DOM, the native inputs handle their own keys and mouse.
   */
  stopEvent(event: Event): boolean {
    const target = event.target as Node | null;
    return target != null && this.dom.contains(target);
  }
}

export const frontmatterView = $view(
  frontmatterSchema.node,
  () => (node, view, getPos) =>
    new FrontmatterView(node as ProseNode, view as EditorView, getPos as () => number | undefined)
);
