import { describe, it, expect } from 'vitest';
import type { EditorView } from 'prosemirror-view';
import { mountEditor } from './helpers/editor';
import { blockActions, deleteBlockAt } from '../src/webview/blocks/block-actions';

/**
 * Common per-block actions (copy / save / delete). The buttons live in every smart block's
 * chrome, in that order; delete removes the whole block from the document.
 */

describe('blockActions button group', () => {
  it('renders copy, save, delete — in that order', () => {
    const group = blockActions({
      view: {} as EditorView,
      getPos: () => undefined,
      onCopy: () => {},
      onSave: () => {}
    });
    const labels = [...group.querySelectorAll('.omd-block-action')].map((b) => b.getAttribute('aria-label'));
    expect(labels).toEqual(['Copy', 'Save as…', 'Delete block']);
  });
});

describe('smart block chrome carries the actions', () => {
  it('a chart block header shows copy / save / delete', async () => {
    const { root } = await mountEditor(
      [
        '<!-- omd:chart {"type":"bar","title":"Revenue"} -->',
        '',
        '| Q | V |',
        '| - | - |',
        '| a | 1 |',
        '',
        '<!-- /omd:chart -->',
        ''
      ].join('\n')
    );
    const actions = root.querySelectorAll('.omd-block--chart .omd-block-action');
    expect([...actions].map((b) => b.getAttribute('aria-label'))).toEqual(['Copy', 'Save as…', 'Delete block']);
  });
});

describe('deleteBlockAt', () => {
  it('removes the whole block from the document', async () => {
    const md = ['Before.', '', '<!-- omd:gallery {} -->', '', 'Inside.', '', '<!-- /omd:gallery -->', '', 'After.', ''].join('\n');
    const { handle } = await mountEditor(md);
    const view = handle.getView();
    let pos: number | null = null;
    view.state.doc.descendants((node, p) => {
      if (pos == null && node.type.name === 'shortcode_container') pos = p;
      return pos == null;
    });
    expect(pos).not.toBeNull();
    deleteBlockAt(view, () => pos ?? undefined);
    const out = handle.getMarkdown();
    expect(out).not.toContain('omd:gallery');
    expect(out).toContain('Before.');
    expect(out).toContain('After.');
  });
});
