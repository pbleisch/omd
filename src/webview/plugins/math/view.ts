import { $view } from '@milkdown/utils';
import type { EditorView, NodeView } from 'prosemirror-view';
import type { Node as ProseNode } from 'prosemirror-model';
import { mathInlineSchema, mathBlockSchema } from './schema';
import { renderMath } from '../../render/katex';

/**
 * Renders a math atom with KaTeX (MathML — no fonts to inline). Clicking the rendered
 * math reveals its LaTeX in an editable field; committing writes the new value back to
 * the node (Principle 3 — one act on the object; Principle 6 — source on demand).
 */
class MathView implements NodeView {
  dom: HTMLElement;
  private editing = false;

  constructor(
    private node: ProseNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined,
    private readonly display: boolean
  ) {
    this.dom = document.createElement(display ? 'div' : 'span');
    this.dom.className = display ? 'omd-math omd-math--block' : 'omd-math';
    this.dom.addEventListener('mousedown', (e) => {
      if (this.editing) return;
      e.preventDefault();
      this.enterEdit();
    });
    this.renderMath();
  }

  private renderMath(): void {
    const tex = this.node.attrs.value as string;
    this.dom.innerHTML = tex
      ? renderMath(tex, this.display)
      : '<span class="omd-math-empty">empty</span>';
  }

  private enterEdit(): void {
    this.editing = true;
    const input = document.createElement(this.display ? 'textarea' : 'input');
    input.className = 'omd-math-edit';
    input.value = this.node.attrs.value as string;
    if (input instanceof HTMLTextAreaElement) input.rows = Math.max(1, input.value.split('\n').length);
    this.dom.innerHTML = '';
    this.dom.appendChild(input);
    input.focus();
    input.select();

    const commit = () => {
      if (!this.editing) return;
      this.editing = false;
      const pos = this.getPos();
      if (pos != null && input.value !== (this.node.attrs.value as string)) {
        this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { value: input.value }));
      }
      // Always re-render to remove the input. Relying on the dispatch → update() → renderMath
      // path fails when the value is unchanged: that's a no-op transaction, so ProseMirror skips
      // the redraw and update() never fires, leaving the edit box stuck open (#21).
      this.renderMath();
      this.view.focus();
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.editing = false;
        this.renderMath();
        this.view.focus();
      } else if (e.key === 'Enter' && (!this.display || e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        commit();
      }
    });
  }

  update(node: ProseNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    if (!this.editing) this.renderMath();
    return true;
  }

  stopEvent(): boolean {
    return this.editing;
  }

  ignoreMutation(): boolean {
    return true;
  }
}

export const mathInlineView = $view(
  mathInlineSchema.node,
  () => (node, view, getPos) =>
    new MathView(node as ProseNode, view as EditorView, getPos as () => number | undefined, false)
);

export const mathBlockView = $view(
  mathBlockSchema.node,
  () => (node, view, getPos) =>
    new MathView(node as ProseNode, view as EditorView, getPos as () => number | undefined, true)
);
