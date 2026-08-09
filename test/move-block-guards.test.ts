/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, it, expect } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { undo, undoDepth } from 'prosemirror-history';
import { mountEditor, roundTrip } from './helpers/editor';
import { normalizeMarkdown } from '../src/shared/roundtrip';
import { buildCommands } from '../src/webview/commands/registry';

/**
 * The two guards that keep Alt+Up / Alt+Down safe, and that `move-block.test.ts` does not
 * cover: an alert's hidden `[!NOTE]` marker is anchored so a body block can never step over
 * an invisible node, and every move is its own undo entry.
 */

async function rig(md: string) {
  const { root, handle } = await mountEditor(md);
  const view = handle.getView();
  const cmds = new Map(buildCommands(view.state.schema).map((c) => [c.id, c]));
  const cursorIn = (text: string): void => {
    let pos: number | null = null;
    view.state.doc.descendants((node, p) => {
      if (pos == null && node.isText && node.text === text) pos = p + 1;
      return pos == null;
    });
    if (pos == null) throw new Error(`no text node "${text}" in ${view.state.doc.toString()}`);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
  };
  return {
    root,
    handle,
    view,
    cursorIn,
    up: () => cmds.get('move-block-up')!.run(view),
    down: () => cmds.get('move-block-down')!.run(view),
    md: () => handle.getMarkdown(),
    doc: () => view.state.doc.toString(),
    depth: () => undoDepth(view.state),
    doUndo: () => undo(view.state, view.dispatch)
  };
}

describe('FIX 1 — the alert marker is anchored', () => {
  it('marker-only first line: the body cannot step over it', async () => {
    const t = await rig('> [!NOTE]\n>\n> body\n');
    t.cursorIn('body');
    expect(t.up()).toBe(false);
    expect(t.md()).toBe('> [!NOTE]\n>\n> body\n');
  });

  it('the marker itself cannot be pushed down into the body', async () => {
    const t = await rig('> [!NOTE]\n>\n> one\n>\n> two\n');
    t.cursorIn('[!NOTE]');
    expect(t.down()).toBe(false);
    expect(t.md()).toBe('> [!NOTE]\n>\n> one\n>\n> two\n');
  });

  it('body blocks BELOW the marker still reorder among themselves', async () => {
    const t = await rig('> [!WARNING]\n>\n> one\n>\n> two\n');
    t.cursorIn('two');
    expect(t.up()).toBe(true);
    expect(t.md()).toBe('> [!WARNING]\n>\n> two\n>\n> one\n');
  });

  it('a list inside the alert body cannot escape above the marker', async () => {
    const t = await rig('> [!NOTE]\n>\n> - a\n> - b\n');
    t.cursorIn('a');
    expect(t.up()).toBe(false);
    expect(t.md()).toBe('> [!NOTE]\n>\n> - a\n> - b\n');
  });

  it('the whole callout still moves at top level (the walk-up still works)', async () => {
    const t = await rig('before\n\n> [!NOTE]\n>\n> body\n\nafter\n');
    t.cursorIn('body');
    expect(t.up()).toBe(true);
    expect(t.md()).toBe('> [!NOTE]\n>\n> body\n\nbefore\n\nafter\n');
    expect(t.up()).toBe(false);
  });

  it('the callout decoration survives — DOM check', async () => {
    const t = await rig('before\n\n> [!NOTE]\n>\n> body\n\nafter\n');
    const callouts = () => t.root.querySelectorAll('.omd-callout').length;
    expect(callouts()).toBe(1);
    t.cursorIn('body');
    t.up();
    expect(callouts()).toBe(1);
  });

  it('a PLAIN blockquote is unaffected — its blocks still reorder', async () => {
    const t = await rig('> one\n>\n> two\n');
    t.cursorIn('two');
    expect(t.up()).toBe(true);
    expect(t.md()).toBe('> two\n>\n> one\n');
  });

  it('a blockquote that only mentions [!NOTE] mid-sentence is a plain quote, not an alert', async () => {
    // The guard uses the same anchored regex the decoration does, so the two agree on what
    // is an alert: this one is not, and its blocks reorder normally.
    const t = await rig('> see [!NOTE] below\n>\n> two\n');
    t.cursorIn('two');
    expect(t.up()).toBe(true);
    expect(t.md()).toBe('> two\n>\n> see [!NOTE] below\n');
  });
});

describe('FIX 2 — one move is one undo entry', () => {
  it('3 rapid moves = 3 undo steps, walking back exactly', async () => {
    const t = await rig('- a\n- b\n- c\n- d\n');
    t.cursorIn('d');
    t.up();
    t.up();
    t.up();
    expect(t.md()).toBe('- d\n- a\n- b\n- c\n');
    expect(t.depth()).toBe(3);
    t.doUndo();
    expect(t.md()).toBe('- a\n- d\n- b\n- c\n');
    t.doUndo();
    expect(t.md()).toBe('- a\n- b\n- d\n- c\n');
    t.doUndo();
    expect(t.md()).toBe('- a\n- b\n- c\n- d\n');
  });

  it('a move no longer swallows the character typed just before it', async () => {
    const t = await rig('- a\n- b\n- c\n');
    t.cursorIn('b');
    t.view.dispatch(t.view.state.tr.insertText('!'));
    t.up();
    expect(t.md()).toBe('- b!\n- a\n- c\n');
    t.doUndo();
    expect(t.md()).toBe('- a\n- b!\n- c\n'); // the "!" survives
  });

  it('undo still restores the selection', async () => {
    const t = await rig('- a\n- b\n- c\n');
    t.cursorIn('c');
    t.up();
    t.doUndo();
    expect(t.view.state.selection.$head.parent.textContent).toBe('c');
  });

  it('a boundary no-op still pushes no history entry', async () => {
    const t = await rig('- a\n- b\n');
    t.cursorIn('a');
    const d0 = t.depth();
    expect(t.up()).toBe(false);
    expect(t.depth()).toBe(d0);
  });
});

describe('REGRESSION — the PR behaviour I could not break still holds', () => {
  const spec: Array<{ name: string; input: string; at: string; dir: 'up' | 'down'; out: string }> = [
    { name: 'bullet reorder', input: '# Doc\n\n- a\n- b\n- c\n\ntail\n', at: 'b', dir: 'up', out: '# Doc\n\n- b\n- a\n- c\n\ntail\n' },
    { name: 'ordered renumber', input: 'intro\n\n1. one\n2. two\n3. three\n\ntail\n', at: 'two', dir: 'down', out: 'intro\n\n1. one\n2. three\n3. two\n\ntail\n' },
    { name: 'paragraph past fence', input: 'alpha\n\n```js\nconst a = 1;\n```\n\ntail\n', at: 'alpha', dir: 'down', out: '```js\nconst a = 1;\n```\n\nalpha\n\ntail\n' },
    { name: 'whole blockquote', input: 'before\n\n> quoted\n\nafter\n', at: 'quoted', dir: 'down', out: 'before\n\nafter\n\n> quoted\n' },
    { name: 'paragraph in plain quote', input: 'intro\n\n> one\n>\n> two\n\ntail\n', at: 'two', dir: 'up', out: 'intro\n\n> two\n>\n> one\n\ntail\n' },
    { name: 'front matter anchored still', input: '---\ntitle: T\n---\n\npara\n\ntail\n', at: 'tail', dir: 'up', out: '---\ntitle: T\n---\n\ntail\n\npara\n' }
  ];
  for (const c of spec) {
    it(c.name, async () => {
      const t = await rig(c.input);
      t.cursorIn(c.at);
      expect(c.dir === 'up' ? t.up() : t.down()).toBe(true);
      const moved = t.md();
      expect(normalizeMarkdown(moved)).toBe(normalizeMarkdown(c.out));
      expect(normalizeMarkdown(await roundTrip(moved))).toBe(normalizeMarkdown(moved));
    });
  }
});
