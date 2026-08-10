import { $view } from '@milkdown/utils';
import { codeBlockSchema } from '@milkdown/preset-commonmark';
import { TextSelection } from 'prosemirror-state';
import type { EditorView, NodeView } from 'prosemirror-view';
import type { Node as ProseNode } from 'prosemirror-model';
import { codicon } from '../codicons';
import { renderMermaid, mermaidReady } from '../render/mermaid';
import { blockActions, copySvgPreview, saveSvgPreview } from '../blocks/block-actions';

/**
 * NodeView for code blocks. A ```mermaid fence renders as a live diagram with a
 * Preview/Source toggle (the smart-block header pattern, docs/design/STYLE.md) — the diagram is
 * shown rendered by default, the source is machinery revealed on demand (Principle 1/6).
 * Every other language is a plain editable <pre><code> so text stays editable and the
 * Shiki highlighter's decorations still apply. The underlying node is unchanged, so the
 * fence round-trips.
 */
class CodeBlockView implements NodeView {
  dom: HTMLElement;
  contentDOM?: HTMLElement;
  private readonly isMermaid: boolean;
  private preview?: HTMLElement;
  private sourcePre?: HTMLElement;
  private tabEls: HTMLButtonElement[] = [];
  private mode: 'preview' | 'source' = 'preview';
  private plainHeader?: HTMLElement;
  private langInput?: HTMLInputElement;

  constructor(
    private node: ProseNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined
  ) {
    this.isMermaid = node.attrs.language === 'mermaid';
    this.dom = this.isMermaid ? this.buildMermaid() : this.buildPlain();
  }

  private buildPlain(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'omd-codeblock-wrap';

    // A small header with a searchable language control (datalist). Editing it updates the fence
    // info string on save and re-highlights.
    const header = document.createElement('div');
    header.className = 'omd-codeblock-header';
    header.contentEditable = 'false';
    header.append(codicon('code'));
    const input = document.createElement('input');
    input.className = 'omd-codeblock-lang';
    input.setAttribute('list', 'omd-code-langs');
    input.placeholder = 'plain text';
    input.spellcheck = false;
    input.value = (this.node.attrs.language as string) || '';
    input.addEventListener('change', () => this.setLanguage(input.value.trim()));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
    });
    ensureLangDatalist();
    header.appendChild(input);
    this.plainHeader = header;
    this.langInput = input;

    const pre = document.createElement('pre');
    pre.className = 'omd-codeblock';
    const code = document.createElement('code');
    if (this.node.attrs.language) code.dataset.language = this.node.attrs.language;
    pre.appendChild(code);
    this.contentDOM = code;

    wrap.append(header, pre);
    return wrap;
  }

  /** Set the code block's language (or clear it), so the fence round-trips and re-highlights. */
  private setLanguage(lang: string): void {
    const pos = this.getPos();
    if (pos == null) return;
    const node = this.view.state.doc.nodeAt(pos);
    if (!node || node.type !== this.node.type) return;
    const value = lang || null;
    if (value === (node.attrs.language ?? null)) return;
    this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, language: value }));
    this.view.focus();
  }

  private buildMermaid(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'omd-smart-block omd-block--mermaid';
    // The wrapper stays editable so the source <code> (contentDOM) can hold a cursor; only the
    // chrome (header + rendered preview) opts out — the chart block does the same. Marking the
    // whole wrapper contentEditable=false is what made the Source tab impossible to type in.

    const header = document.createElement('div');
    header.className = 'omd-block-header';
    header.contentEditable = 'false';
    const name = document.createElement('div');
    name.className = 'omd-block-name';
    name.append(codicon('type-hierarchy'), Object.assign(document.createElement('span'), {
      textContent: 'mermaid'
    }));
    const tabs = document.createElement('div');
    tabs.className = 'omd-block-tabs';
    const previewTab = this.tabButton('Diagram', () => this.setMode('preview'));
    const sourceTab = this.tabButton('Source', () => this.setMode('source'));
    this.tabEls = [previewTab, sourceTab];
    tabs.append(previewTab, sourceTab);
    // Common block actions: copy / save / delete. A diagram's preview is its SVG.
    const actions = blockActions({
      view: this.view,
      getPos: this.getPos,
      onCopy: () => {
        const svg = this.preview?.querySelector('svg');
        return svg ? copySvgPreview(svg) : Promise.resolve();
      },
      onSave: () => {
        const svg = this.preview?.querySelector('svg');
        if (svg) saveSvgPreview(svg, 'diagram');
      }
    });
    header.append(name, tabs, actions);

    const body = document.createElement('div');
    body.className = 'omd-block-body';
    this.preview = document.createElement('div');
    this.preview.className = 'omd-mermaid-preview';
    this.preview.contentEditable = 'false';

    // Editable source lives in a <pre><code> contentDOM, hidden while previewing.
    const pre = document.createElement('pre');
    pre.className = 'omd-codeblock omd-block-source';
    const code = document.createElement('code');
    pre.appendChild(code);
    this.contentDOM = code;
    this.sourcePre = pre;

    body.append(this.preview, pre);
    wrap.append(header, body);
    this.applyMode();
    void this.render();
    return wrap;
  }

  private tabButton(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'omd-block-tab';
    btn.type = 'button';
    btn.textContent = label;
    btn.dataset.tab = label.toLowerCase();
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onClick();
    });
    return btn;
  }

  private setMode(mode: 'preview' | 'source'): void {
    this.mode = mode;
    this.applyMode();
    if (mode === 'preview') void this.render();
    else {
      // Put the cursor inside the code block's text so typing lands in the diagram source.
      const pos = this.getPos();
      if (pos != null) {
        const inside = Math.min(pos + 1, this.view.state.doc.content.size);
        const tr = this.view.state.tr.setSelection(
          TextSelection.near(this.view.state.doc.resolve(inside))
        );
        this.view.dispatch(tr);
        this.view.focus();
      }
    }
  }

  private applyMode(): void {
    if (!this.isMermaid || !this.preview || !this.sourcePre) return;
    const previewing = this.mode === 'preview';
    this.preview.style.display = previewing ? '' : 'none';
    this.sourcePre.style.display = previewing ? 'none' : '';
    this.tabEls.forEach((t) => {
      t.classList.toggle('omd-block-tab--active', t.dataset.tab === this.mode);
    });
  }

  private async render(): Promise<void> {
    if (!this.preview) return;
    const code = this.node.textContent.trim();
    if (!code) {
      this.preview.innerHTML = '<div class="omd-block-empty">Empty diagram</div>';
      return;
    }
    // The mermaid runtime loads on the first diagram in a session (docs/operations/PERFORMANCE.md).
    // Only then — never on a redraw, which keeps the previous diagram up until the new one is
    // ready — say the diagram is coming, so the block is never a silent empty frame.
    if (!mermaidReady() && !this.preview.firstChild) {
      const pending = document.createElement('div');
      pending.className = 'omd-block-empty omd-block-pending';
      pending.textContent = 'Rendering diagram…';
      this.preview.appendChild(pending);
    }
    try {
      this.preview.innerHTML = await renderMermaid(code);
    } catch (err) {
      // Show the real parse error so the writer can fix it — never a dead "unavailable".
      this.preview.innerHTML = '';
      const msg = document.createElement('div');
      msg.className = 'omd-block-error';
      msg.textContent = err instanceof Error ? err.message : String(err);
      this.preview.appendChild(msg);
    }
  }

  update(node: ProseNode): boolean {
    if (node.type !== this.node.type) return false;
    // A change in "kind" (mermaid <-> plain) needs a fresh view.
    if ((node.attrs.language === 'mermaid') !== this.isMermaid) return false;
    this.node = node;
    if (this.isMermaid) {
      if (this.mode === 'preview') void this.render();
    } else {
      // Reflect a language change (e.g. from the context menu) without clobbering active typing.
      const lang = (node.attrs.language as string) || '';
      if (this.langInput && document.activeElement !== this.langInput) this.langInput.value = lang;
      if (this.contentDOM) {
        if (lang) this.contentDOM.dataset.language = lang;
        else delete this.contentDOM.dataset.language;
      }
    }
    return true;
  }

  /** Let the language input handle its own keyboard/mouse — don't route them into ProseMirror. */
  stopEvent(event: Event): boolean {
    const target = event.target as HTMLElement | null;
    return !!(this.plainHeader && target && this.plainHeader.contains(target));
  }

  ignoreMutation(mutation: MutationRecord): boolean {
    if (!this.contentDOM) return true;
    return !this.contentDOM.contains(mutation.target as unknown as ProseNode & HTMLElement);
  }
}

/** Common languages for the code-block language picker's datalist (the input still accepts any). */
const COMMON_LANGS = [
  'typescript', 'javascript', 'tsx', 'jsx', 'json', 'html', 'css', 'scss', 'python', 'bash',
  'shell', 'markdown', 'yaml', 'toml', 'rust', 'go', 'sql', 'java', 'c', 'cpp', 'csharp', 'ruby',
  'php', 'swift', 'kotlin', 'dart', 'mermaid', 'diff', 'dockerfile', 'xml', 'graphql', 'ini',
  'makefile', 'powershell', 'lua', 'scala', 'plaintext'
];

let langDatalistReady = false;
function ensureLangDatalist(): void {
  if (langDatalistReady || document.getElementById('omd-code-langs')) {
    langDatalistReady = true;
    return;
  }
  const dl = document.createElement('datalist');
  dl.id = 'omd-code-langs';
  for (const lang of COMMON_LANGS) {
    const opt = document.createElement('option');
    opt.value = lang;
    dl.appendChild(opt);
  }
  document.body.appendChild(dl);
  langDatalistReady = true;
}

export const codeBlockView = $view(codeBlockSchema.node, () => (node, view, getPos) => {
  return new CodeBlockView(node as ProseNode, view as EditorView, getPos as () => number | undefined);
});
