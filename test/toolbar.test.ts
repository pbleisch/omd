import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mountEditor } from './helpers/editor';
import { mountToolbar } from '../src/webview/ui/toolbar';
import { setBlocks } from '../src/webview/blocks/registry';
import { SHIPPED_BLOCKS } from '../src/shared/blocks';

/**
 * Toolbar layout: block/object inserts live behind one Insert ▾ dropdown (so the bar doesn't
 * crowd), and zoom sits in the normal flow beside Find rather than pinned far right. Every entry
 * still drives the one command registry (Principle 4).
 */
async function mount(markdown = 'hello\n') {
  const { handle } = await mountEditor(markdown);
  const container = document.createElement('div');
  document.body.appendChild(container);
  mountToolbar(container, handle.getView());
  return { handle, container };
}

const openInsert = (container: HTMLElement): HTMLElement => {
  const btn = container.querySelector('.omd-toolbar-insert') as HTMLElement;
  btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  return document.querySelector('.omd-insert-menu') as HTMLElement;
};

describe('toolbar layout', () => {
  beforeEach(() => setBlocks(SHIPPED_BLOCKS));
  afterEach(() => document.querySelectorAll('.omd-floating').forEach((n) => n.remove()));

  it('renders an Insert dropdown and keeps zoom + find together at the end', async () => {
    const { container } = await mount();
    expect(container.querySelector('.omd-toolbar-insert')).toBeTruthy();
    const end = container.querySelector('.omd-toolbar-end') as HTMLElement;
    expect(end).toBeTruthy();
    expect(end.querySelector('.omd-zoom-label')).toBeTruthy(); // zoom lives in the end group
    expect(end.querySelector('[aria-label="Find"], [aria-label="Search"], [aria-label*="ind"]')).toBeTruthy();
    // The block-insert buttons are no longer loose in the bar (they moved into the dropdown).
    expect(container.querySelector('[aria-label="Table"]')).toBeNull();
  });

  it('opens the Insert menu with the promoted block/object inserts', async () => {
    const { container } = await mount();
    const menu = openInsert(container);
    expect(menu).toBeTruthy();
    const labels = [...menu.querySelectorAll('.omd-insert-item .omd-slash-label')].map((e) => e.textContent);
    for (const expected of ['Table', 'Code block', 'Image', 'Callout', 'Chart', 'Two columns']) {
      expect(labels).toContain(expected);
    }
  });

  it('choosing an item runs its command (Callout inserts the block)', async () => {
    const { handle, container } = await mount();
    const menu = openInsert(container);
    const callout = [...menu.querySelectorAll<HTMLElement>('.omd-insert-item')].find(
      (i) => i.textContent?.trim() === 'Callout'
    )!;
    callout.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(handle.getMarkdown()).toContain('omd:callout');
  });
});
