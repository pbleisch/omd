import { describe, it, expect, afterEach } from 'vitest';
import { NodeSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { mountEditor } from './helpers/editor';
import { findEditableBlock, openBlockProperties } from '../src/webview/blocks/edit-properties';
import { closeParamPanel } from '../src/webview/ui/param-panel';

const sourceInput = (panel: HTMLElement): HTMLInputElement =>
  panel.querySelector('input[type="text"]') as HTMLInputElement; // Source is the first text field

/**
 * Media-cluster unification: a sized image edits its width / align / caption through the *same*
 * floating property panel every smart block uses — no bespoke image toolbar. These tests drive
 * the real panel (segmented Width/Align controls + the Caption input) and assert the omdImage's
 * coexistence bytes are rewritten correctly, byte-for-byte, on GitHub-visible forms.
 */

function imagePos(view: EditorView): number {
  let at = -1;
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === 'omdImage') at = pos;
    return true;
  });
  if (at < 0) throw new Error('no omdImage in doc');
  return at;
}

/** Select the image and open its property panel, returning the mounted panel element. */
function openImagePanel(view: EditorView): HTMLElement {
  const pos = imagePos(view);
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
  const block = findEditableBlock(view.state);
  if (!block || block.kind !== 'image') throw new Error('image not resolved as editable');
  openBlockProperties(view, block);
  const panel = document.querySelector('.omd-param-panel') as HTMLElement;
  if (!panel) throw new Error('panel did not open');
  return panel;
}

const seg = (panel: HTMLElement, label: string): HTMLButtonElement => {
  const btns = [...panel.querySelectorAll<HTMLButtonElement>('.omd-seg')];
  // Text buttons (S/M/L/Full) match by label; icon-only buttons (align) match by title.
  const btn =
    btns.find((b) => (b.textContent ?? '').trim() === label) ??
    btns.find((b) => b.title.toLowerCase().includes(label.toLowerCase()));
  if (!btn) throw new Error(`no segment "${label}"`);
  return btn;
};
const click = (el: HTMLElement): void => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));

describe('image property panel', () => {
  afterEach(() => closeParamPanel());

  it('resolves a selected image as an editable image block', async () => {
    const { handle } = await mountEditor('<img src="cat.png" width="400" alt="a cat">\n');
    const view = handle.getView();
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, imagePos(view))));
    const block = findEditableBlock(view.state);
    expect(block?.kind).toBe('image');
  });

  it('leads with a Source field and rewrites the image path in place', async () => {
    const { handle } = await mountEditor('<img src="old.png" width="400" alt="a cat">\n');
    const view = handle.getView();
    const panel = openImagePanel(view);
    expect([...panel.querySelectorAll('.omd-field-label')].map((e) => e.textContent)).toEqual([
      'Source',
      'Width',
      'Align',
      'Caption'
    ]);
    const src = sourceInput(panel);
    expect(src.value).toBe('old.png');
    src.value = 'new.png';
    src.dispatchEvent(new Event('change', { bubbles: true }));
    expect(handle.getMarkdown()).toBe('<img src="new.png" width="400" alt="a cat">\n');
  });

  it('Width segment reflects the current size and rewrites it on click', async () => {
    const { handle } = await mountEditor('<img src="cat.png" width="400" alt="a cat">\n');
    const view = handle.getView();
    const panel = openImagePanel(view);
    // Initial value 400 → the "M" button is active.
    expect(seg(panel, 'M').classList.contains('omd-seg--active')).toBe(true);
    click(seg(panel, 'Full'));
    expect(handle.getMarkdown()).toBe('<img src="cat.png" width="100%" alt="a cat">\n');
  });

  it('typing a specific width (px default, or %) writes it to the image bytes', async () => {
    const { handle } = await mountEditor('<img src="cat.png" width="400" alt="a cat">\n');
    const view = handle.getView();
    const panel = openImagePanel(view);
    const widthInput = panel.querySelector('.omd-field-widthinput') as HTMLInputElement;
    widthInput.value = '500px';
    widthInput.dispatchEvent(new Event('change', { bubbles: true }));
    expect(handle.getMarkdown()).toBe('<img src="cat.png" width="500" alt="a cat">\n');
    widthInput.value = '80%';
    widthInput.dispatchEvent(new Event('change', { bubbles: true }));
    expect(handle.getMarkdown()).toBe('<img src="cat.png" width="80%" alt="a cat">\n');
  });

  it('Align wraps the image in a <div align> and unwraps on deselect', async () => {
    const { handle } = await mountEditor('<img src="cat.png" width="400" alt="a cat">\n');
    const view = handle.getView();
    let panel = openImagePanel(view);
    click(seg(panel, 'center'));
    expect(handle.getMarkdown()).toBe(
      '<div align="center">\n\n<img src="cat.png" width="400" alt="a cat">\n\n</div>\n'
    );
    // Re-open (structure changed) and deselect the active alignment → back to a bare sized image.
    panel = openImagePanel(view);
    click(seg(panel, 'center'));
    expect(handle.getMarkdown()).toBe('<img src="cat.png" width="400" alt="a cat">\n');
  });

  it('Caption promotes the image to a <figure> with the entered text', async () => {
    const { handle } = await mountEditor('<img src="cat.png" width="400" alt="a cat">\n');
    const view = handle.getView();
    const panel = openImagePanel(view);
    // The Caption input is the last text input (Width also has one now).
    const caption = [...panel.querySelectorAll<HTMLInputElement>('input[type="text"]')].pop()!;
    caption.value = 'A cat';
    caption.dispatchEvent(new Event('change', { bubbles: true }));
    expect(handle.getMarkdown()).toBe(
      '<figure>\n  <img src="cat.png" width="400" alt="a cat">\n  <figcaption>A cat</figcaption>\n</figure>\n'
    );
  });
});

describe('bare image property panel', () => {
  afterEach(() => closeParamPanel());

  function bareImagePos(view: EditorView): number {
    let at = -1;
    view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'image') at = pos;
      return true;
    });
    if (at < 0) throw new Error('no bare image');
    return at;
  }

  const openBarePanel = (view: EditorView): HTMLElement => {
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, bareImagePos(view))));
    const block = findEditableBlock(view.state);
    if (!block || block.kind !== 'image') throw new Error('bare image not resolved');
    openBlockProperties(view, block);
    return document.querySelector('.omd-param-panel') as HTMLElement;
  };

  it('offers the full panel for a standalone bare image (same as a sized one)', async () => {
    const { handle } = await mountEditor('![a cat](old.png)\n');
    const panel = openBarePanel(handle.getView());
    expect([...panel.querySelectorAll('.omd-field-label')].map((e) => e.textContent)).toEqual([
      'Source',
      'Width',
      'Align',
      'Caption'
    ]);
  });

  it('fixes a mistyped path in place, staying bare markdown (no promotion)', async () => {
    const { handle } = await mountEditor('![a cat](typo.png)\n');
    const panel = openBarePanel(handle.getView());
    const src = sourceInput(panel);
    expect(src.value).toBe('typo.png');
    src.value = 'fixed.png';
    src.dispatchEvent(new Event('change', { bubbles: true }));
    expect(handle.getMarkdown()).toBe('![a cat](fixed.png)\n'); // untouched size → stays bare
  });

  it('promotes to <img width> when a width is set', async () => {
    const { handle } = await mountEditor('![a cat](cat.png)\n');
    const panel = openBarePanel(handle.getView());
    click(seg(panel, 'M')); // 400
    expect(handle.getMarkdown()).toBe('<img src="cat.png" width="400" alt="a cat">\n');
  });

  it('wraps in <div align> when only alignment is set (image stays bare inside)', async () => {
    const { handle } = await mountEditor('![a cat](cat.png)\n');
    const panel = openBarePanel(handle.getView());
    click(seg(panel, 'center'));
    // No width/caption yet, so the image keeps its bare markdown form inside the alignment wrapper.
    expect(handle.getMarkdown()).toBe(
      '<div align="center">\n\n![a cat](cat.png)\n\n</div>\n'
    );
  });

  it('promotes to a <figure> when a caption is set', async () => {
    const { handle } = await mountEditor('![a cat](cat.png)\n');
    const panel = openBarePanel(handle.getView());
    const caption = [...panel.querySelectorAll<HTMLInputElement>('input[type="text"]')].pop()!;
    caption.value = 'A cat';
    caption.dispatchEvent(new Event('change', { bubbles: true }));
    expect(handle.getMarkdown()).toBe(
      '<figure>\n  <img src="cat.png" alt="a cat">\n  <figcaption>A cat</figcaption>\n</figure>\n'
    );
  });
});
