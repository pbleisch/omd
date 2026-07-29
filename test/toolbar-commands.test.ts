import { describe, it, expect } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { mountEditor } from './helpers/editor';
import { buildCommands, type OmdCommand } from '../src/webview/commands/registry';
import { normalizeMarkdown } from '../src/shared/roundtrip';

/**
 * Phase 3: the toolbar-enrichment commands. They ride the one registry (Principle 4), so
 * these drive the same `run`/`isActive` the toolbar, keymap, and slash menu call. Results
 * round-trip to valid GFM (Principle 2).
 */

async function withEditor(markdown: string) {
  const { handle } = await mountEditor(markdown);
  const view = handle.getView();
  const byId = new Map(buildCommands(view.state.schema).map((c) => [c.id, c]));
  const cmd = (id: string): OmdCommand => {
    const c = byId.get(id);
    if (!c) throw new Error(`no command ${id}`);
    return c;
  };
  const select = (from: number, to: number) =>
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
  return { handle, view, cmd, select };
}

describe('history commands', () => {
  it('undo reverts the last change and redo reapplies it', async () => {
    const { handle, view, cmd, select } = await withEditor('title\n');
    select(1, 1);
    cmd('h2').run(view);
    expect(normalizeMarkdown(handle.getMarkdown())).toBe('## title\n');

    cmd('undo').run(view);
    expect(normalizeMarkdown(handle.getMarkdown())).toBe('title\n');

    cmd('redo').run(view);
    expect(normalizeMarkdown(handle.getMarkdown())).toBe('## title\n');
  });
});

describe('task list command', () => {
  it('turns a paragraph into a GFM task item and round-trips', async () => {
    const { handle, view, cmd, select } = await withEditor('buy milk\n');
    select(1, 1);
    cmd('task-list').run(view);
    expect(normalizeMarkdown(handle.getMarkdown())).toContain('- [ ] buy milk');
  });

  it('reports active inside a task item', async () => {
    const { view, cmd, select } = await withEditor('- [ ] done\n');
    select(3, 3);
    expect(cmd('task-list').isActive?.(view.state)).toBe(true);
  });
});

describe('footnote command', () => {
  it('inserts a numbered footnote reference and definition', async () => {
    const { handle, view, cmd, select } = await withEditor('see note\n');
    select(9, 9); // end of "see note"
    cmd('footnote').run(view);
    const out = normalizeMarkdown(handle.getMarkdown());
    expect(out).toMatch(/\[\^1\]/);
  });
});

describe('link command', () => {
  it('wraps a selection in a link via the URL prompt', async () => {
    const { handle, view, cmd, select } = await withEditor('click here\n');
    select(1, 6); // "click"
    cmd('link').run(view);
    const input = document.querySelector<HTMLInputElement>('.omd-popover-input')!;
    expect(input).toBeTruthy();
    input.value = 'https://example.com';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(normalizeMarkdown(handle.getMarkdown())).toContain('[click](https://example.com)');
  });

  it('unlinks when the cursor sits in an existing link', async () => {
    const { handle, view, cmd, select } = await withEditor('[click](https://example.com) here\n');
    select(3, 3); // inside the linked word
    expect(cmd('link').isActive?.(view.state)).toBe(true);
    cmd('link').run(view);
    expect(normalizeMarkdown(handle.getMarkdown())).toBe('click here\n');
  });
});

describe('image command', () => {
  it('inserts an image at the cursor via the URL prompt', async () => {
    const { handle, view, cmd, select } = await withEditor('before\n');
    select(7, 7);
    cmd('image').run(view);
    const input = document.querySelector<HTMLInputElement>('.omd-popover-input')!;
    input.value = 'https://example.com/x.png';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(normalizeMarkdown(handle.getMarkdown())).toContain('![](https://example.com/x.png)');
  });
});
