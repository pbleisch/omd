import type { EditorView } from 'prosemirror-view';
import { TextSelection } from 'prosemirror-state';
import { codicon } from '../codicons';
import { getBacklinks, onBacklinksChanged } from '../blocks/backlinks-registry';
import { collectHeadings } from '../blocks/toc';
import { onEditorUpdate } from '../commands/state-events';
import { post } from '../vscode';

/**
 * The Outline sidebar (250px left): the document's headings up top, backlinks
 * below (capped at ~half the height). It is derived, never serialized — the outline follows
 * the document live, and clicking an entry moves the cursor there. Exactly one of each panel
 * (docs/design/STYLE.md); it hides entirely when there is nothing to show.
 */
function section(title: string, icon: string, extraClass = ''): { root: HTMLElement; body: HTMLElement } {
  const root = document.createElement('section');
  root.className = `omd-outline-section ${extraClass}`.trim();
  const head = document.createElement('div');
  head.className = 'omd-outline-head';
  head.append(codicon(icon));
  const label = document.createElement('span');
  label.textContent = title;
  head.appendChild(label);
  const body = document.createElement('div');
  body.className = 'omd-outline-body';
  root.append(head, body);
  return { root, body };
}

/** Move the cursor to a heading and scroll it into view. */
function goToHeading(view: EditorView, pos: number): void {
  const tr = view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos + 1)));
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

export function mountOutlinePanel(container: HTMLElement, view: EditorView): void {
  const panel = document.createElement('aside');
  panel.className = 'omd-outline-panel';

  const contents = section('Contents', 'list-tree', 'omd-outline-contents');
  const backlinks = section('Backlinks', 'references', 'omd-outline-backlinks');
  panel.append(contents.root, backlinks.root);
  container.appendChild(panel);

  const renderContents = () => {
    const headings = collectHeadings(view);
    contents.root.style.display = headings.length ? '' : 'none';
    if (headings.length) {
      const minLevel = Math.min(...headings.map((h) => h.level));
      contents.body.replaceChildren(
        ...headings.map((h) => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'omd-outline-item';
          item.style.paddingLeft = `${(h.level - minLevel) * 12 + 8}px`;
          item.textContent = h.text || '(untitled)';
          item.addEventListener('click', () => goToHeading(view, h.pos));
          return item;
        })
      );
    }
    updateVisibility();
  };

  const renderBacklinks = () => {
    const links = getBacklinks();
    backlinks.root.style.display = links.length ? '' : 'none';
    backlinks.body.replaceChildren(
      ...links.map((link) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'omd-backlink';
        item.title = link.path;
        const title = document.createElement('span');
        title.className = 'omd-backlink-title';
        title.textContent = link.title;
        const label = document.createElement('span');
        label.className = 'omd-backlink-label';
        label.textContent = link.label;
        item.append(title, label);
        item.addEventListener('click', () => post({ type: 'openTarget', target: link.path }));
        return item;
      })
    );
    updateVisibility();
  };

  const updateVisibility = () => {
    const has = getBacklinks().length > 0 || collectHeadings(view).length > 0;
    panel.classList.toggle('omd-outline-panel--visible', has);
    document.body.classList.toggle('omd-has-outline', has);
  };

  renderContents();
  renderBacklinks();
  onEditorUpdate(renderContents);
  onBacklinksChanged(renderBacklinks);
}
