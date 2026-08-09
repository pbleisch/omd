import { describe, it, expect } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { mountEditor, roundTrip } from './helpers/editor';
import { normalizeMarkdown } from '../src/shared/roundtrip';
import { buildCommands } from '../src/webview/commands/registry';

/**
 * Alt+Up / Alt+Down move the block around the cursor among its siblings. The unit that
 * moves is the deepest ancestor with a sibling in the direction of travel, so the same
 * command reorders list items, paragraphs inside an item, and top-level blocks.
 */

async function moveEditor(md: string) {
  const { handle } = await mountEditor(md);
  const view = handle.getView();
  const cmds = new Map(buildCommands(view.state.schema).map((c) => [c.id, c]));

  /** Put the cursor inside the (first) text node whose content is exactly `text`. */
  const cursorIn = (text: string): void => {
    let pos: number | null = null;
    view.state.doc.descendants((node, p) => {
      if (pos == null && node.isText && node.text === text) pos = p + 1;
      return pos == null;
    });
    if (pos == null) throw new Error(`no text node "${text}"`);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
  };

  /** The text of the block the cursor currently sits in — proves the selection followed. */
  const cursorText = (): string => view.state.selection.$head.parent.textContent;

  const up = (): boolean => cmds.get('move-block-up')!.run(view);
  const down = (): boolean => cmds.get('move-block-down')!.run(view);
  const md_ = (): string => handle.getMarkdown();
  return { handle, view, cursorIn, cursorText, up, down, md: md_ };
}

describe('move block: list items (the issue case)', () => {
  it('moves a bullet item up and back down among its siblings', async () => {
    const t = await moveEditor('- a\n- b\n- c\n');
    t.cursorIn('b');
    expect(t.up()).toBe(true);
    expect(t.md()).toBe('- b\n- a\n- c\n');
    expect(t.down()).toBe(true);
    expect(t.md()).toBe('- a\n- b\n- c\n');
  });

  it('no-ops at the first and last item so the key falls through', async () => {
    const t = await moveEditor('- a\n- b\n');
    t.cursorIn('a');
    expect(t.up()).toBe(false);
    t.cursorIn('b');
    expect(t.down()).toBe(false);
    expect(t.md()).toBe('- a\n- b\n');
  });

  it('carries the whole subtree, nested sublist included', async () => {
    const t = await moveEditor('- a\n- b\n  - b1\n  - b2\n- c\n');
    t.cursorIn('b');
    expect(t.up()).toBe(true);
    expect(t.md()).toBe('- b\n  - b1\n  - b2\n- a\n- c\n');
  });

  it('moves a nested item only among its own siblings, never changing depth', async () => {
    const t = await moveEditor('- a\n  - a1\n  - a2\n- b\n');
    t.cursorIn('a2');
    expect(t.up()).toBe(true);
    expect(t.md()).toBe('- a\n  - a2\n  - a1\n- b\n');
    // a2 is now first in the sublist: it does not escape into the outer list.
    expect(t.up()).toBe(false);
    expect(t.md()).toBe('- a\n  - a2\n  - a1\n- b\n');
  });

  it('renumbers an ordered list, moving the content and not the markers', async () => {
    const t = await moveEditor('1. one\n2. two\n3. three\n');
    t.cursorIn('three');
    expect(t.up()).toBe(true);
    expect(t.md()).toBe('1. one\n2. three\n3. two\n');
  });

  it('moves a task item and keeps its checked state', async () => {
    const t = await moveEditor('- [ ] a\n- [x] b\n- [ ] c\n');
    t.cursorIn('b');
    expect(t.up()).toBe(true);
    expect(t.md()).toBe('- [x] b\n- [ ] a\n- [ ] c\n');
  });

  it('moves the paragraph inside a multi-paragraph item, not the item', async () => {
    const t = await moveEditor('- one\n\n  two\n- three\n');
    t.cursorIn('two');
    expect(t.up()).toBe(true);
    expect(t.md()).toBe('- two\n\n  one\n- three\n');
  });
});

describe('move block: the walk-up rule', () => {
  it('moves a top-level paragraph past a heading and a code block', async () => {
    const t = await moveEditor('# H\n\npara\n\n```js\nconst a = 1;\n```\n');
    t.cursorIn('para');
    expect(t.down()).toBe(true);
    expect(t.md()).toBe('# H\n\n```js\nconst a = 1;\n```\n\npara\n');
    expect(t.up()).toBe(true);
    expect(t.up()).toBe(true);
    expect(t.md()).toBe('para\n\n# H\n\n```js\nconst a = 1;\n```\n');
  });

  it('moves a paragraph within a blockquote', async () => {
    const t = await moveEditor('> one\n>\n> two\n');
    t.cursorIn('two');
    expect(t.up()).toBe(true);
    expect(t.md()).toBe('> two\n>\n> one\n');
  });

  it('walks up from a single-paragraph blockquote and moves the whole quote', async () => {
    const t = await moveEditor('before\n\n> quoted\n\nafter\n');
    t.cursorIn('quoted');
    expect(t.up()).toBe(true);
    expect(t.md()).toBe('> quoted\n\nbefore\n\nafter\n');
  });

  it('no-ops at the very start and the very end of the document', async () => {
    const t = await moveEditor('first\n\nlast\n');
    t.cursorIn('first');
    expect(t.up()).toBe(false);
    t.cursorIn('last');
    expect(t.down()).toBe(false);
    expect(t.md()).toBe('first\n\nlast\n');
  });
});

describe('move block: selection and anchoring', () => {
  it('carries the selection so repeated presses walk the same block', async () => {
    const t = await moveEditor('- a\n- b\n- c\n- d\n');
    t.cursorIn('d');
    expect(t.up()).toBe(true);
    expect(t.cursorText()).toBe('d');
    expect(t.up()).toBe(true);
    expect(t.cursorText()).toBe('d');
    expect(t.md()).toBe('- a\n- d\n- b\n- c\n');
  });

  it('leaves front matter anchored and refuses to move a block above it', async () => {
    const t = await moveEditor('---\ntitle: T\n---\n\npara\n\ntail\n');
    t.cursorIn('para');
    expect(t.up()).toBe(false);
    expect(t.md()).toBe('---\ntitle: T\n---\n\npara\n\ntail\n');
    // Blocks below it still reorder normally.
    t.cursorIn('tail');
    expect(t.up()).toBe(true);
    expect(t.md()).toBe('---\ntitle: T\n---\n\ntail\n\npara\n');
  });

  it('declines when the document has a single block', async () => {
    const t = await moveEditor('only\n');
    t.cursorIn('only');
    expect(t.up()).toBe(false);
    expect(t.down()).toBe(false);
    expect(t.md()).toBe('only\n');
  });

  it('does not swap table cells with a vertical key', async () => {
    const t = await moveEditor('| A | B |\n| --- | --- |\n| 1 | 2 |\n');
    t.cursorIn('2');
    t.up();
    // Whatever the table row command decides, the cells stay in their columns.
    expect(t.md()).toContain('| 1 | 2 |');
  });
});

/**
 * Principle 2 for the reorder command. Each case moves one block inside a document that has
 * untouched content on both sides, asserts the whole file byte-for-byte (so the *unmoved*
 * parts are proven untouched too), and re-opens the result to confirm it is stable GFM —
 * blank lines around fences and tables intact, list tightness unchanged, numbering
 * sequential.
 */
describe('round-trip: documents after a move', () => {
  const cases: Array<{ name: string; input: string; at: string; dir: 'up' | 'down'; out: string }> = [
    {
      name: 'bullet list reorder',
      input: '# Doc\n\n- a\n- b\n- c\n\ntail\n',
      at: 'b',
      dir: 'up',
      out: '# Doc\n\n- b\n- a\n- c\n\ntail\n'
    },
    {
      name: 'ordered list renumbers',
      input: 'intro\n\n1. one\n2. two\n3. three\n\ntail\n',
      at: 'two',
      dir: 'down',
      out: 'intro\n\n1. one\n2. three\n3. two\n\ntail\n'
    },
    {
      name: 'task list keeps its boxes',
      input: 'intro\n\n- [ ] a\n- [x] b\n- [ ] c\n\ntail\n',
      at: 'a',
      dir: 'down',
      out: 'intro\n\n- [x] b\n- [ ] a\n- [ ] c\n\ntail\n'
    },
    {
      name: 'item with a nested sublist stays tight',
      input: 'intro\n\n- a\n- b\n  - b1\n  - b2\n- c\n\ntail\n',
      at: 'b',
      dir: 'down',
      out: 'intro\n\n- a\n- c\n- b\n  - b1\n  - b2\n\ntail\n'
    },
    {
      name: 'two top-level paragraphs',
      input: '# Doc\n\none\n\ntwo\n\ntail\n',
      at: 'one',
      dir: 'down',
      out: '# Doc\n\ntwo\n\none\n\ntail\n'
    },
    {
      name: 'paragraph swaps with a heading',
      input: 'alpha\n\n## Section\n\ntail\n',
      at: 'alpha',
      dir: 'down',
      out: '## Section\n\nalpha\n\ntail\n'
    },
    {
      name: 'paragraph swaps with a fenced code block',
      input: 'alpha\n\n```js\nconst a = 1;\n```\n\ntail\n',
      at: 'alpha',
      dir: 'down',
      out: '```js\nconst a = 1;\n```\n\nalpha\n\ntail\n'
    },
    {
      name: 'paragraph swaps with a table',
      input: 'alpha\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\ntail\n',
      at: 'alpha',
      dir: 'down',
      out: '| a | b |\n| --- | --- |\n| 1 | 2 |\n\nalpha\n\ntail\n'
    },
    {
      name: 'paragraph moves inside a blockquote',
      input: 'intro\n\n> one\n>\n> two\n\ntail\n',
      at: 'two',
      dir: 'up',
      out: 'intro\n\n> two\n>\n> one\n\ntail\n'
    },
    {
      name: 'whole blockquote moves at top level',
      input: 'before\n\n> quoted\n\nafter\n',
      at: 'quoted',
      dir: 'down',
      out: 'before\n\nafter\n\n> quoted\n'
    },
    {
      // The hazard: a paragraph stepping over a list must not re-space the list loose.
      name: 'paragraph swaps past a tight list, which stays tight',
      input: 'alpha\n\n- a\n- b\n\ntail\n',
      at: 'alpha',
      dir: 'down',
      out: '- a\n- b\n\nalpha\n\ntail\n'
    },
    {
      name: 'a loose list stays loose when a paragraph steps over it',
      input: 'alpha\n\n- a\n\n- b\n\ntail\n',
      at: 'alpha',
      dir: 'down',
      out: '- a\n\n- b\n\nalpha\n\ntail\n'
    },
    {
      name: 'paragraph swaps with an HTML block',
      input: 'alpha\n\n<div align="center">\n  <b>x</b>\n</div>\n\ntail\n',
      at: 'alpha',
      dir: 'down',
      out: '<div align="center">\n  <b>x</b>\n</div>\n\nalpha\n\ntail\n'
    },
    {
      name: 'a whole list moves among top-level blocks',
      input: 'alpha\n\n- only\n\ntail\n',
      at: 'only',
      dir: 'up',
      out: '- only\n\nalpha\n\ntail\n'
    }
  ];

  for (const c of cases) {
    it(c.name, async () => {
      const t = await moveEditor(c.input);
      t.cursorIn(c.at);
      expect(c.dir === 'up' ? t.up() : t.down()).toBe(true);
      const moved = t.md();
      expect(normalizeMarkdown(moved)).toBe(normalizeMarkdown(c.out));
      // Re-opening what we just wrote reproduces it: the move left clean, stable GFM.
      expect(normalizeMarkdown(await roundTrip(moved))).toBe(normalizeMarkdown(moved));
    });
  }
});

/**
 * Principle 4: the shortcut is not a second implementation. `commands/keymap.ts` binds each
 * registry command's `key` to its `run`, so pressing the keys drives the very code the
 * context menu runs. This asserts the whole path through the live editor.
 */
describe('move block: the Alt+Arrow keymap', () => {
  const key = (view: import('prosemirror-view').EditorView, k: string): boolean => {
    const ev = new KeyboardEvent('keydown', { key: k, altKey: true, bubbles: true, cancelable: true });
    view.dom.dispatchEvent(ev);
    return ev.defaultPrevented;
  };

  it('Alt+ArrowUp and Alt+ArrowDown reorder the list item under the cursor', async () => {
    const t = await moveEditor('- a\n- b\n- c\n');
    t.cursorIn('c');
    expect(key(t.view, 'ArrowUp')).toBe(true);
    expect(t.md()).toBe('- a\n- c\n- b\n');
    expect(key(t.view, 'ArrowDown')).toBe(true);
    expect(t.md()).toBe('- a\n- b\n- c\n');
  });

  it('leaves the key unhandled at a boundary so other handlers still see it', async () => {
    const t = await moveEditor('- a\n- b\n');
    t.cursorIn('a');
    expect(key(t.view, 'ArrowUp')).toBe(false);
    expect(t.md()).toBe('- a\n- b\n');
  });
});

/**
 * Columns are laid out side by side, so a vertical key must not reorder them: the walk-up
 * skips the column level and moves the whole columns block instead.
 */
describe('move block: columns are not reordered by a vertical key', () => {
  const COLUMNS = '<table><tr><td>\n\nleft\n\n</td><td>\n\nright\n\n</td></tr></table>';

  it('walks past the column and moves the whole block', async () => {
    const t = await moveEditor(`alpha\n\n${COLUMNS}\n\ntail\n`);
    t.cursorIn('right');
    expect(t.up()).toBe(true);
    const out = t.md();
    expect(out.indexOf('left')).toBeLessThan(out.indexOf('right')); // columns kept their order
    expect(out.indexOf('left')).toBeLessThan(out.indexOf('alpha')); // the block moved above alpha
    expect(normalizeMarkdown(await roundTrip(out))).toBe(normalizeMarkdown(out));
  });
});
