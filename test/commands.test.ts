import { describe, it, expect } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { mountEditor } from './helpers/editor';
import { buildCommands, type OmdCommand } from '../src/webview/commands/registry';
import { normalizeMarkdown } from '../src/shared/roundtrip';

/**
 * P3 exit criterion: the one command registry is what the toolbar, keymap, and slash
 * menu all drive. These tests exercise the registry directly against a live editor —
 * the same `run`/`isActive` the three surfaces call — so a break here is a break in all
 * three. Results must also round-trip (Principle 2).
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
  const select = (from: number, to: number) => {
    const sel = TextSelection.create(view.state.doc, from, to);
    view.dispatch(view.state.tr.setSelection(sel));
  };
  return { handle, view, cmd, select };
}

describe('command registry: marks toggle', () => {
  it('bold wraps a selection and toggles back off', async () => {
    const { handle, view, cmd, select } = await withEditor('hello world\n');
    select(1, 6); // "hello"
    cmd('bold').run(view);
    expect(normalizeMarkdown(handle.getMarkdown())).toBe('**hello** world\n');

    select(1, 10); // now spans "**hello**" region
    cmd('bold').run(view);
    expect(normalizeMarkdown(handle.getMarkdown())).toBe('hello world\n');
  });

  it('isActive reflects the cursor sitting inside a mark', async () => {
    const { view, cmd, select } = await withEditor('**bold** plain\n');
    select(3, 3); // inside the bold word
    expect(cmd('bold').isActive?.(view.state)).toBe(true);
    select(11, 11); // inside "plain"
    expect(cmd('bold').isActive?.(view.state)).toBe(false);
  });
});

describe('command registry: block toggles', () => {
  it('heading toggles on, reports active, and toggles back to paragraph', async () => {
    const { handle, view, cmd, select } = await withEditor('title\n');
    select(1, 1);
    cmd('h2').run(view);
    expect(normalizeMarkdown(handle.getMarkdown())).toBe('## title\n');
    expect(cmd('h2').isActive?.(view.state)).toBe(true);

    cmd('h2').run(view);
    expect(normalizeMarkdown(handle.getMarkdown())).toBe('title\n');
    expect(cmd('h2').isActive?.(view.state)).toBe(false);
  });
});

describe('command registry: inserts round-trip', () => {
  it('inserting a note callout produces a valid GitHub alert', async () => {
    const { handle, view, cmd, select } = await withEditor('start\n');
    select(6, 6); // end of "start"
    cmd('callout-note').run(view);
    const out = normalizeMarkdown(handle.getMarkdown());
    expect(out).toContain('> [!NOTE]');
  });

  it('inserting a divider serializes to a thematic break', async () => {
    const { handle, view, cmd, select } = await withEditor('above\n');
    select(6, 6);
    cmd('divider').run(view);
    expect(normalizeMarkdown(handle.getMarkdown())).toContain('---');
  });
});
