import { describe, it, expect } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { mountEditor } from './helpers/editor';
import { buildMenuEntries } from '../src/webview/plugins/context-menu';
import type { MenuEntry, MenuItem } from '../src/webview/ui/context-menu';

/**
 * The context menu is a discovery surface: always populated (Insert / Turn into / clipboard),
 * and adapting to context (formatting + comment on a selection, table ops in a table). Since
 * it replaces VS Code's native menu, it also owns Cut/Copy/Paste. `buildMenuEntries` is pure
 * over the view state, so we assert exactly what surfaces.
 */

const items = (entries: MenuEntry[]): MenuItem[] => entries.filter((e): e is MenuItem => e !== 'sep');
const labels = (entries: MenuEntry[]): string[] => items(entries).map((e) => e.label);
const find = (entries: MenuEntry[], label: string): MenuItem | undefined =>
  items(entries).find((e) => e.label === label);

function selectText(view: EditorView, text: string): void {
  let from = -1;
  view.state.doc.descendants((node, pos) => {
    if (from >= 0) return false;
    if (node.isText && node.text?.includes(text)) from = pos + node.text.indexOf(text);
    return true;
  });
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, from + text.length)));
}

describe('context menu is always a discovery surface', () => {
  it('a bare cursor still offers Insert, Turn into, and clipboard', async () => {
    const { handle } = await mountEditor('hello world\n');
    const got = labels(buildMenuEntries(handle.getView()));
    expect(got).toContain('Insert');
    expect(got).toContain('Turn into');
    expect(got).toContain('Cut');
    expect(got).toContain('Copy');
    expect(got).toContain('Paste');
    expect(got).not.toContain('Bold'); // no selection → no formatting
  });

  it('the Insert submenu lists blocks; Turn into lists block types', async () => {
    const { handle } = await mountEditor('hello\n');
    const entries = buildMenuEntries(handle.getView());
    const insert = labels(find(entries, 'Insert')!.submenu!);
    expect(insert).toContain('Table');
    expect(insert).toContain('Divider');
    expect(insert).not.toContain('Heading 1'); // headings live under Turn into
    const turn = labels(find(entries, 'Turn into')!.submenu!);
    expect(turn).toEqual(expect.arrayContaining(['Paragraph', 'Heading 1', 'Quote', 'Bullet list']));
  });

  it('a selection adds formatting, link, and comment', async () => {
    const { handle } = await mountEditor('hello world\n');
    const view = handle.getView();
    selectText(view, 'hello');
    const got = labels(buildMenuEntries(view));
    expect(got).toEqual(
      expect.arrayContaining(['Bold', 'Italic', 'Inline code', 'Strikethrough', 'Link', 'Add comment'])
    );
  });

  it('inside a table it adds the row/column/align/delete ops', async () => {
    const md = ['| A | B |', '| --- | --- |', '| 1 | 2 |', ''].join('\n');
    const { handle } = await mountEditor(md);
    const view = handle.getView();
    let at = -1;
    view.state.doc.descendants((n, p) => {
      if (at < 0 && n.isText && n.text === '1') at = p + 1;
      return true;
    });
    view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(at))));
    const got = labels(buildMenuEntries(view));
    expect(got).toContain('Insert row above');
    expect(got).toContain('Delete table');
  });

  it('a leaf entry runs its command', async () => {
    const { handle } = await mountEditor('hello world\n');
    const view = handle.getView();
    selectText(view, 'hello');
    find(buildMenuEntries(view), 'Bold')!.run!();
    expect(handle.getMarkdown()).toContain('**hello**');
  });
});
