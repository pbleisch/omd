import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TextSelection } from 'prosemirror-state';
import { mountEditor, roundTrip } from './helpers/editor';
import { buildCommands } from '../src/webview/commands/registry';

/**
 * Serializer guards for the two "the bytes mean something else on reopen" defects
 * (#23, #30). The byte-level round-trip suite is blind to both: in #23 the bytes are
 * stable and only their *meaning* changes, and in #30 the escape is dropped in a shape
 * no corpus file covered. So these tests assert the parse, not just the bytes —
 * reopen the output and look at the document it produces.
 */

/** The block outline of `md` as parsed by the real editor. */
async function outline(md: string): Promise<string[]> {
  const { handle } = await mountEditor(md);
  const names: string[] = [];
  handle.getView().state.doc.forEach((node) => names.push(node.type.name));
  return names;
}

describe('#23: a document-initial thematic break never reopens as front matter', () => {
  // micromark-extension-frontmatter opens front matter on any `---` at line 1 column 1 and
  // closes it on the next `---` anywhere later — prose and blank lines in between are not
  // checked, and there is no option to make it stricter. `---` is therefore unusable in
  // document-initial position; `***` renders identically and cannot open front matter.

  it('emits `***`, not `---`, for the first block of a document', async () => {
    expect(await roundTrip('***\n\nalpha\n\nbeta\n\n---\n')).toBe('***\n\nalpha\n\nbeta\n\n---\n');
  });

  it('normalizes any leading-break spelling to `***`', async () => {
    for (const rule of ['***', '___', '- - -', '* * *']) {
      expect(await roundTrip(`${rule}\n\ntext\n`)).toBe('***\n\ntext\n');
    }
  });

  it('the on-disk case that needs no edit: leading break + a later `---` stays prose', async () => {
    // Before the guard this saved as `---\n\nalpha\n\nbeta\n\n---\n`, which reopens as one
    // front matter node — the document stops being prose, permanently and byte-stably.
    const output = await roundTrip('***\n\nalpha\n\nbeta\n\n---\n');
    expect(await outline(output)).toEqual([
      'hr',
      'paragraph',
      'paragraph',
      'hr'
    ]);
  });

  it('the issue reproduction: Alt+Down over a leading thematic break', async () => {
    const { handle } = await mountEditor('alpha\n\n---\n\nbeta\n\n---\n');
    const view = handle.getView();
    const cmds = new Map(buildCommands(view.state.schema).map((c) => [c.id, c]));
    let pos: number | null = null;
    view.state.doc.descendants((node, p) => {
      if (pos == null && node.isText && node.text === 'alpha') pos = p + 1;
      return pos == null;
    });
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos!)));
    expect(cmds.get('move-block-down')!.run(view)).toBe(true);

    const moved = handle.getMarkdown();
    expect(moved.startsWith('---')).toBe(false);
    expect(await outline(moved)).not.toContain('frontmatter');
  });

  it('leaves a non-leading thematic break as `---` (the repo stringify policy)', async () => {
    expect(await roundTrip('above\n\n---\n\nbelow\n')).toBe('above\n\n---\n\nbelow\n');
    expect(await roundTrip('# h\n\n---\n')).toBe('# h\n\n---\n');
  });

  it('leaves real front matter alone — it is a `yaml` node, never a thematic break', async () => {
    const md = '---\ntitle: x\n---\n\nbody\n';
    expect(await roundTrip(md)).toBe(md);
    expect(await outline(md)).toEqual(['frontmatter', 'paragraph']);
  });
});

describe('#30: escapes survive a save even when the text node ends in whitespace', () => {
  // @milkdown/core overrides remark's `text` handler and returns the raw value without
  // calling `state.safe()` when it matches /^[^*_\\]*\s+$/. Every case below lands in
  // that shape, so before the override the writer's backslash was simply dropped.

  it('an escaped pipe in a table cell keeps its escape and its column count', async () => {
    const md = '| a | b |\n| --- | --- |\n| `"leaf"` \\| `"container"` | x |\n';
    const output = await roundTrip(md);
    expect(output).toContain('`"leaf"` \\| `"container"`');

    // The point of the escape: the row still has two columns when it is read back.
    const { handle } = await mountEditor(output);
    const row = handle.getView().state.doc.child(0).child(1);
    expect(row.childCount).toBe(2);
  });

  it('`\\[not a ref]` stays literal text', async () => {
    // The backslash itself is no longer written out: nothing on this line can turn the
    // brackets into a link, so the escape is dropped as one the document does not need
    // (#37). What #30 is about is the *meaning*, and it is unchanged — assert that
    // directly rather than trusting the spelling.
    const output = await roundTrip('see `a` \\[not a ref] `b` here\n');
    expect(output).toBe('see `a` [not a ref] `b` here\n');
    const { handle } = await mountEditor(output);
    const types: string[] = [];
    handle.getView().state.doc.descendants((node) => {
      types.push(node.type.name, ...node.marks.map((m) => m.type.name));
      return true;
    });
    expect(types).not.toContain('link');
    expect(handle.getView().state.doc.textContent).toContain('[not a ref]');
  });

  it('keeps the escape where dropping it would make a link', async () => {
    // The other half: here the brackets *can* form a link, so the backslash stays.
    // (remark also escapes the `(`, which is its own belt-and-braces, and stable.)
    const output = await roundTrip('see \\[not a ref](x) here\n');
    expect(output).toContain('\\[not a ref]');
    expect(await roundTrip(output)).toBe(output);
  });

  it('`\\<div>` stays literal text and does not become inline HTML', async () => {
    const output = await roundTrip('see `a` \\<div> `b` here\n');
    expect(output).toBe('see `a` \\<div> `b` here\n');
    const { handle } = await mountEditor(output);
    expect(handle.getView().state.doc.textContent).toContain('<div>');
  });

  it("the repo's own doc with the live trigger keeps its escaped pipes", async () => {
    const path = join(__dirname, '..', 'docs', 'contributing', 'AUTHORING-SMART-BLOCKS.md');
    const input = readFileSync(path, 'utf8');
    const output = await roundTrip(input);
    expect(output).toContain('`"leaf"` \\| `"container"`');
    expect(output).toContain('`string` \\| `number` \\| `boolean`');
    // The escapes are what make these two-column rows; without them the table gains columns.
    const inputCols = await tableWidths(input);
    expect(await tableWidths(output)).toEqual(inputCols);
  });

  async function tableWidths(md: string): Promise<number[]> {
    const { handle } = await mountEditor(md);
    const widths: number[] = [];
    handle.getView().state.doc.forEach((node) => {
      if (node.type.name === 'table') node.forEach((row) => widths.push(row.childCount));
    });
    return widths;
  }
});

describe('#30: the restored escapes are a fixed point, not a ratchet', () => {
  // An escape that is re-escaped on every save is a different bug from an escape that is
  // dropped. These assert the third generation equals the second for every #30 shape.
  const cases: Array<[string, string]> = [
    ['table cell pipe', '| a | b |\n| --- | --- |\n| `"leaf"` \\| `"container"` | x |\n'],
    ['bracket', 'see `a` \\[not a ref] `b` here\n'],
    ['angle bracket', 'see `a` \\<div> `b` here\n'],
    ['leading thematic break', '***\n\nalpha\n\nbeta\n\n---\n']
  ];
  for (const [name, md] of cases) {
    it(name, async () => {
      const gen2 = await roundTrip(md);
      expect(await roundTrip(gen2)).toBe(gen2);
    });
  }

  it('holds next to an HTML entity, which used to double the backslash every save', async () => {
    // The shape that made this fix reach the escape-doubling bug in the entity plugin's raw-source
    // re-slice: restoring `state.safe()` means more text carries a backslash, and a backslash next
    // to an entity used to grow without bound. #29 made that scan escape-aware, so the two fixes
    // compose — the escape is preserved *and* stable.
    const md = 'a \\*x\\* &amp; b\n';
    const gen2 = await roundTrip(md);
    expect(gen2).toBe(md);
    expect(await roundTrip(gen2)).toBe(gen2);
  });

  it('holds next to an entity for an escape that is dropped as unneeded', async () => {
    // `\[x]` cannot form a link here, so #37 drops the backslash — once. The doubling bug
    // this guards was about *growth*, so what matters is that the second generation is a
    // fixed point and no backslash is ever added back.
    const gen2 = await roundTrip('a \\[x] &amp; b\n');
    expect(gen2).toBe('a [x] &amp; b\n');
    expect(await roundTrip(gen2)).toBe(gen2);
  });
});

describe('#30: what the Milkdown bypass was protecting — whitespace is unaffected', () => {
  // Milkdown added the raw-value bypass deliberately, most plausibly to preserve trailing
  // spaces. `state.safe()` escapes markdown-significant characters; it does not touch
  // whitespace, so restoring it costs nothing here. Each case below is exactly the shape
  // the bypass matched (no `*`, `_` or `\`, ending in whitespace) and is byte-identical
  // with and without it.
  const cases: Array<[string, string]> = [
    ['interior runs are preserved', 'a   b `c`\n'],
    ['trailing space at end of paragraph', 'a `b` \n'],
    ['trailing space at end of heading', '# a `b` \n'],
    ['trailing space at end of list item', '- a `b` \n'],
    ['trailing space at end of blockquote', '> a `b` \n'],
    ['whitespace before an inline node', 'a `code` b\n'],
    ['whitespace before a math span', 'a $x$ b\n'],
    ['whitespace before inline HTML', 'a <sub>x</sub> b\n'],
    ['a two-space hard break', 'a `x`  \nb\n']
  ];
  const expected: Record<string, string> = {
    'a   b `c`\n': 'a   b `c`\n',
    'a `b` \n': 'a `b`\n',
    '# a `b` \n': '# a `b`\n',
    '- a `b` \n': '- a `b`\n',
    '> a `b` \n': '> a `b`\n',
    'a `code` b\n': 'a `code` b\n',
    'a $x$ b\n': 'a $x$ b\n',
    'a <sub>x</sub> b\n': 'a <sub>x</sub> b\n',
    'a `x`  \nb\n': 'a `x`\\\nb\n'
  };
  for (const [name, md] of cases) {
    it(name, async () => {
      expect(await roundTrip(md)).toBe(expected[md]);
    });
  }
});

/**
 * #32: an empty list item is empty. Milkdown spells an empty paragraph `<br />` on the way
 * out, which turned `1.` in the repository's own bug-report template into `1. <br />` —
 * content invented in a file nobody edited. Its parse plugin *deletes* `<br />` nodes on
 * the way in, so the two spellings are the same document and `1.` is the one a writer meant.
 */
describe('#32: an empty list item does not gain a line break', () => {
  it('leaves empty ordered items empty', async () => {
    expect(await roundTrip('## Steps\n\n1.\n2.\n3.\n')).toBe('## Steps\n\n1.\n2.\n3.\n');
  });

  it('leaves empty bullet items empty', async () => {
    expect(await roundTrip('-\n-\n')).toBe('-\n-\n');
  });

  it('still carries the content of a non-empty item', async () => {
    expect(await roundTrip('1. one\n2.\n3. three\n')).toBe('1. one\n2.\n3. three\n');
  });

  it('still preserves a blank line between two root blocks', async () => {
    // The `<br />` spelling is what Milkdown's preserve-empty-line feature is *for*; only
    // the list-item case is suppressed.
    expect(await roundTrip('a\n\n<br />\n\nb\n')).toBe('a\n\n<br />\n\nb\n');
  });
});
