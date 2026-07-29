import { describe, it, expect, vi } from 'vitest';
import { inlineEdit } from '../src/webview/plugins/media/chrome';

/**
 * Inline field editing (captions, renames) happens inside the ProseMirror DOM, so its keystrokes
 * must NOT reach PM's keymap — otherwise Backspace/Delete/arrows run document commands and get
 * preventDefaulted, and the field's own native editing never happens. `inlineEdit` guards this by
 * stopping keydown propagation while the field has focus.
 */
describe('inlineEdit keyboard handling', () => {
  function mount(text = 'caption') {
    const parent = document.createElement('div');
    const el = document.createElement('span');
    el.textContent = text;
    parent.appendChild(el);
    document.body.appendChild(parent);
    return { parent, el };
  }

  it('stops keystrokes from bubbling to an ancestor (the ProseMirror keymap)', () => {
    const { parent, el } = mount();
    const ancestorKeydown = vi.fn();
    parent.addEventListener('keydown', ancestorKeydown);

    inlineEdit(el, { onCommit: () => {} });
    for (const key of ['Backspace', 'Delete', 'ArrowLeft', 'a']) {
      el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    }
    expect(ancestorKeydown).not.toHaveBeenCalled();
  });

  it('does not preventDefault ordinary editing keys (so native editing proceeds)', () => {
    const { el } = mount();
    inlineEdit(el, { onCommit: () => {} });
    const ev = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('commits on Enter and cancels on Escape', () => {
    const { el } = mount();
    const onCommit = vi.fn();
    const onCancel = vi.fn();

    inlineEdit(el, { onCommit, onCancel });
    el.textContent = 'edited';
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(onCommit).toHaveBeenCalledWith('edited');

    inlineEdit(el, { onCommit, onCancel });
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(onCancel).toHaveBeenCalled();
  });
});
