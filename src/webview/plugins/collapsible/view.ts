import { $view } from '@milkdown/utils';
import type { EditorView, NodeView } from 'prosemirror-view';
import type { Node as ProseNode } from 'prosemirror-model';
import { codicon } from '../../codicons';
import { detailsSchema } from './schema';

/**
 * NodeView for the native collapsible: a clickable summary row that folds its body, matching
 * what `<details>` does on GitHub. The fold is *view state only* — collapsing never edits the
 * document, so the round-trip is untouched; the initial state comes from the `open` attribute
 * the file actually carries. Double-clicking the summary text edits it inline (the new text is
 * written into the raw `<summary>…</summary>` bytes so it round-trips).
 */

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Replace the content of the `<summary>…</summary>` in the raw opener, preserving everything else. */
export function withSummaryText(openRaw: string, text: string): string {
  return openRaw.replace(/(<summary[^>]*>)[\s\S]*?(<\/summary>)/i, `$1${escapeHtml(text)}$2`);
}

class DetailsView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private open: boolean;
  private readonly twisty: HTMLElement;
  private readonly label: HTMLElement;
  private editing = false;

  constructor(
    private node: ProseNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined
  ) {
    this.open = Boolean(node.attrs.openByDefault);

    this.dom = document.createElement('div');
    this.dom.className = 'omd-details';

    const summary = document.createElement('div');
    summary.className = 'omd-details-summary';
    summary.contentEditable = 'false';

    this.twisty = codicon('chevron-right');
    this.twisty.classList.add('omd-details-twisty');

    const label = document.createElement('span');
    label.className = 'omd-details-label';
    label.title = 'Double-click to rename';
    label.textContent = node.attrs.summary || 'Details';
    this.label = label;
    label.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.startEdit();
    });

    summary.append(this.twisty, label);
    summary.addEventListener('mousedown', (e) => {
      if (this.editing) return; // don't fold while renaming
      e.preventDefault();
      this.toggle();
    });

    this.contentDOM = document.createElement('div');
    this.contentDOM.className = 'omd-details-body';

    this.dom.append(summary, this.contentDOM);
    this.apply();

    // Find reveals a match inside a folded section by opening it (see find-plugin).
    this.dom.addEventListener('omd:reveal', () => {
      if (!this.open) {
        this.open = true;
        this.apply();
      }
    });
  }

  private toggle(): void {
    this.open = !this.open;
    this.apply();
  }

  /** Enter inline rename: make the label editable, select its text. */
  private startEdit(): void {
    this.editing = true;
    this.label.contentEditable = 'true';
    this.label.classList.add('omd-details-label--editing');
    this.label.focus();
    const range = document.createRange();
    range.selectNodeContents(this.label);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    const finish = (commit: boolean) => {
      this.label.removeEventListener('blur', onBlur);
      this.label.removeEventListener('keydown', onKey);
      this.editing = false;
      this.label.contentEditable = 'false';
      this.label.classList.remove('omd-details-label--editing');
      if (commit) this.commitSummary((this.label.textContent ?? '').trim());
      else this.label.textContent = this.node.attrs.summary || 'Details';
    };
    const onBlur = () => finish(true);
    const onKey = (e: KeyboardEvent) => {
      // Keep keystrokes out of ProseMirror's keymap while renaming (else Backspace etc. run
      // document commands instead of editing the label).
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        this.label.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
        this.view.focus();
      }
    };
    this.label.addEventListener('blur', onBlur);
    this.label.addEventListener('keydown', onKey);
  }

  /** Write the new summary into both the attr and the raw `<summary>` bytes so it round-trips. */
  private commitSummary(text: string): void {
    const pos = this.getPos();
    if (pos == null) return;
    const node = this.view.state.doc.nodeAt(pos);
    if (!node || node.type !== this.node.type) return;
    if (text === (node.attrs.summary as string)) return; // no change
    const openRaw = withSummaryText(node.attrs.openRaw as string, text);
    this.view.dispatch(
      this.view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, summary: text, openRaw })
    );
  }

  /**
   * Visibility is driven by a class on the wrapper, never an inline style on `contentDOM`:
   * mutating the content element makes ProseMirror redraw the NodeView, which would throw the
   * fold state away the instant the user clicked. CSS hides the body instead.
   */
  private apply(): void {
    this.dom.classList.toggle('omd-details--open', this.open);
  }

  update(node: ProseNode): boolean {
    if (node.type !== this.node.type) return false;
    if (!this.editing) this.label.textContent = (node.attrs.summary as string) || 'Details';
    this.node = node;
    return true;
  }

  /**
   * Only real content edits should reach ProseMirror. Our own chrome changes (the fold class,
   * the summary label) are attribute mutations outside `contentDOM`; letting PM see them would
   * make it redraw the NodeView and reset the fold. Selection mutations are always passed on.
   */
  ignoreMutation(mutation: MutationRecord | { type: 'selection'; target: Node }): boolean {
    if (mutation.type === 'selection') return false;
    if (mutation.type === 'attributes') return true;
    return !this.contentDOM.contains(mutation.target as Node);
  }

  /** While renaming, the label owns its own keyboard/mouse — keep ProseMirror out of it. */
  stopEvent(event: Event): boolean {
    return this.editing && this.label.contains(event.target as Node);
  }
}

export const detailsView = $view(
  detailsSchema.node,
  () => (node, view, getPos) =>
    new DetailsView(node as ProseNode, view as EditorView, getPos as () => number | undefined)
);
