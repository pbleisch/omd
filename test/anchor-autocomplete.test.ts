import { describe, it, expect, afterEach } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { mountEditor } from './helpers/editor';
import { normalizeMarkdown } from '../src/shared/roundtrip';

/**
 * Section-link autocomplete: typing a link anchor `[label](#…` in the document offers the doc's
 * headings, and choosing one completes a real `[text](#slug)` link (GitHub-native — not a wikilink).
 * Reuses the one mention/issue menu surface.
 */

/** Put the cursor at the end of the paragraph containing `text`. */
function cursorAtEndOf(view: EditorView, text: string): void {
  let at = -1;
  view.state.doc.descendants((node, pos) => {
    if (node.isText && node.text?.includes(text)) at = pos + node.nodeSize;
    return true;
  });
  if (at < 0) throw new Error(`no text ${text}`);
  view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(at))));
}

const DOC = '# Getting Started\n\n## Install Steps\n\nJump\n';

async function typeAnchor(rest: string) {
  const { handle } = await mountEditor(DOC);
  const view = handle.getView();
  cursorAtEndOf(view, 'Jump');
  view.dispatch(view.state.tr.insertText(`[](#${rest}`)); // type the anchor idiom
  const menu = document.querySelector('.omd-ref-menu') as HTMLElement | null;
  return { handle, view, menu };
}

const rows = (menu: HTMLElement) =>
  [...menu.querySelectorAll('.omd-slash-item')].map((r) => ({
    label: r.querySelector('.omd-slash-label')?.textContent,
    el: r as HTMLElement
  }));

describe('section-link autocomplete', () => {
  afterEach(() => document.querySelectorAll('.omd-ref-menu').forEach((n) => n.remove()));

  it('opens on `[](#` and lists the document headings', async () => {
    const { menu } = await typeAnchor('');
    expect(menu && menu.style.display !== 'none').toBe(true);
    expect(rows(menu!).map((r) => r.label)).toEqual(['Getting Started', 'Install Steps']);
  });

  it('filters by slug or heading text as you type', async () => {
    const { menu } = await typeAnchor('install');
    expect(rows(menu!).map((r) => r.label)).toEqual(['Install Steps']);
  });

  it('completing with an empty label fills the heading text and a #slug link', async () => {
    const { handle, menu } = await typeAnchor('');
    rows(menu!)
      .find((r) => r.label === 'Install Steps')!
      .el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(normalizeMarkdown(handle.getMarkdown())).toContain('[Install Steps](#install-steps)');
  });

  it('keeps a label the user typed', async () => {
    const { handle } = await mountEditor(DOC);
    const view = handle.getView();
    cursorAtEndOf(view, 'Jump');
    view.dispatch(view.state.tr.insertText('[the steps](#inst'));
    const menu = document.querySelector('.omd-ref-menu') as HTMLElement;
    rows(menu)[0].el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(normalizeMarkdown(handle.getMarkdown())).toContain('[the steps](#install-steps)');
  });
});
