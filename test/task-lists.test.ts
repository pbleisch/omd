import { describe, it, expect } from 'vitest';
import { mountEditor } from './helpers/editor';
import { toggleTaskAt } from '../src/webview/plugins/task-lists';

/**
 * Toggling a task checkbox is a real edit on the object (Principle 3): flipping the
 * `checked` attr must serialize to `[x]` / `[ ]`, not require hand-editing characters.
 */
describe('task-list toggle', () => {
  async function firstTaskPos(md: string) {
    const { handle } = await mountEditor(md);
    const view = handle.getView();
    let pos = -1;
    view.state.doc.descendants((node, p) => {
      if (pos === -1 && node.type.name === 'list_item' && node.attrs.checked != null) pos = p;
    });
    return { handle, view, pos };
  }

  it('unchecked -> checked serializes to [x]', async () => {
    const { handle, view, pos } = await firstTaskPos('- [ ] task\n');
    expect(pos).toBeGreaterThanOrEqual(0);
    view.dispatch(toggleTaskAt(view.state, pos)!);
    expect(handle.getMarkdown().trim()).toBe('- [x] task');
  });

  it('checked -> unchecked serializes to [ ]', async () => {
    const { handle, view, pos } = await firstTaskPos('- [x] task\n');
    view.dispatch(toggleTaskAt(view.state, pos)!);
    expect(handle.getMarkdown().trim()).toBe('- [ ] task');
  });
});
