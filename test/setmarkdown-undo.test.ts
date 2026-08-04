import { describe, it, expect } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { mountEditor } from './helpers/editor';
import { buildCommands, type OmdCommand } from '../src/webview/commands/registry';
import { normalizeMarkdown } from '../src/shared/roundtrip';

/**
 * Verify that edits separated by a meaningful pause undo independently. The history plugin's
 * timeThreshold (200ms) controls grouping: edits within the threshold undo as one, edits
 * outside it undo separately. Intermediate transactions (markdownUpdated listener, etc.) can
 * affect the effective threshold, so a generous pause is used in tests.
 */

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

describe('undo groups rapid edits, separates paused edits', () => {
  it('two heading changes separated by a pause undo independently', async () => {
    const { handle, view, cmd, select } = await withEditor('hello\n');

    // Edit 1: convert to H2
    select(1, 1);
    cmd('h2').run(view);
    await wait(50);
    expect(normalizeMarkdown(handle.getMarkdown())).toBe('## hello\n');

    // Wait longer than timeThreshold so this is a new undo group.
    // Use 1s because intermediate transactions (markdownUpdated, etc.) can reset the timer.
    await wait(1000);

    // Edit 2: convert to H3
    select(1, 1);
    cmd('h3').run(view);
    await wait(50);
    expect(normalizeMarkdown(handle.getMarkdown())).toBe('### hello\n');

    // Undo should only undo edit 2 (H3 -> H2)
    cmd('undo').run(view);
    await wait(50);
    expect(normalizeMarkdown(handle.getMarkdown())).toBe('## hello\n');

    // Another undo should get back to plain text
    cmd('undo').run(view);
    await wait(50);
    expect(normalizeMarkdown(handle.getMarkdown())).toBe('hello\n');
  });

  it('two rapid edits within timeThreshold undo as one step', async () => {
    const { handle, view, cmd, select } = await withEditor('hello\n');

    // Edit 1: convert to H2
    select(1, 1);
    cmd('h2').run(view);
    // No wait — immediately do edit 2

    // Edit 2: convert to H3 (within timeThreshold of edit 1)
    select(1, 1);
    cmd('h3').run(view);
    await wait(50);
    expect(normalizeMarkdown(handle.getMarkdown())).toBe('### hello\n');

    // Undo should undo both edits together (they're within timeThreshold)
    cmd('undo').run(view);
    await wait(50);
    expect(normalizeMarkdown(handle.getMarkdown())).toBe('hello\n');
  });

  it('setMarkdown does not break undo', async () => {
    const { handle, view, cmd, select } = await withEditor('title\n');

    // Make an edit: convert to H1
    select(1, 1);
    cmd('h1').run(view);
    await wait(50);

    // setMarkdown (simulating host push) — this creates an undo step but should not
    // prevent the original edit from being undone.
    handle.setMarkdown('# title\n');
    await wait(50);

    // Undo: may need up to 2 undos (setMarkdown is its own step, then the H1 edit)
    cmd('undo').run(view);
    await wait(50);
    let md = normalizeMarkdown(handle.getMarkdown());
    if (md !== 'title\n') {
      cmd('undo').run(view);
      await wait(50);
      md = normalizeMarkdown(handle.getMarkdown());
    }
    expect(md).toBe('title\n');
  });
});
