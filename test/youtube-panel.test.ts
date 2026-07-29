import { describe, it, expect, afterEach } from 'vitest';
import { NodeSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { mountEditor } from './helpers/editor';
import { findEditableBlock, openBlockProperties } from '../src/webview/blocks/edit-properties';
import { closeParamPanel } from '../src/webview/ui/param-panel';

/**
 * Media-cluster unification, part two: a YouTube block edits its width / align / caption through
 * the same floating panel as an image (and every other smart block) — no bespoke media toolbar.
 * These drive the real panel and assert the shortcode's GitHub-visible bytes.
 */

const id = 'dQw4w9WgXcQ';
const YT = [
  `<!-- omd:youtube {"url":"https://youtu.be/${id}"} -->`,
  '',
  `[![Watch on YouTube](https://img.youtube.com/vi/${id}/hqdefault.jpg)](https://youtu.be/${id})`,
  '',
  '<!-- /omd:youtube -->',
  ''
].join('\n');

function containerPos(view: EditorView): number {
  let at = -1;
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === 'shortcode_container' && node.attrs.name === 'youtube') at = pos;
    return true;
  });
  if (at < 0) throw new Error('no youtube container');
  return at;
}

function openYtPanel(view: EditorView): HTMLElement {
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, containerPos(view))));
  const block = findEditableBlock(view.state);
  if (!block || block.kind !== 'shortcode' || block.def.name !== 'youtube')
    throw new Error('youtube not resolved as editable');
  openBlockProperties(view, block);
  const panel = document.querySelector('.omd-param-panel') as HTMLElement;
  if (!panel) throw new Error('panel did not open');
  return panel;
}

const seg = (panel: HTMLElement, label: string): HTMLButtonElement => {
  const btns = [...panel.querySelectorAll<HTMLButtonElement>('.omd-seg')];
  const btn =
    btns.find((b) => (b.textContent ?? '').trim() === label) ??
    btns.find((b) => b.title.toLowerCase().includes(label.toLowerCase()));
  if (!btn) throw new Error(`no segment "${label}"`);
  return btn;
};
const click = (el: HTMLElement): void => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));

describe('youtube property panel', () => {
  afterEach(() => closeParamPanel());

  it('lays out Title, URL, Width, Align, Caption', async () => {
    const { handle } = await mountEditor(YT);
    const panel = openYtPanel(handle.getView());
    const labels = [...panel.querySelectorAll('.omd-field-label')].map((e) => e.textContent);
    expect(labels).toEqual(['Title', 'URL', 'Width', 'Align', 'Caption']);
  });

  it('Width segment writes the shortcode width param', async () => {
    const { handle } = await mountEditor(YT);
    const panel = openYtPanel(handle.getView());
    click(seg(panel, 'M'));
    expect(handle.getMarkdown()).toContain(`{"url":"https://youtu.be/${id}","width":"400"}`);
  });

  it('Align wraps the block in <div align> and unwraps on deselect', async () => {
    const { handle } = await mountEditor(YT);
    const view = handle.getView();
    click(seg(openYtPanel(view), 'center'));
    expect(handle.getMarkdown()).toContain('<div align="center">');
    // Re-open (structure changed) and deselect → the wrapper is gone.
    click(seg(openYtPanel(view), 'center'));
    expect(handle.getMarkdown()).not.toContain('<div align');
  });

  it('Caption writes the caption param', async () => {
    const { handle } = await mountEditor(YT);
    const panel = openYtPanel(handle.getView());
    const caption = [...panel.querySelectorAll<HTMLInputElement>('input[type="text"]')].pop()!;
    caption.value = 'A demo';
    caption.dispatchEvent(new Event('change', { bubbles: true }));
    expect(handle.getMarkdown()).toContain('"caption":"A demo"');
  });
});
