import { describe, expect, it } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { undo } from 'prosemirror-history';
import { createOmdEditor } from '../src/webview/editor';
import { moveBlock } from '../src/webview/commands/move-block';
import { mountEditor, roundTrip, roundTripDoc } from './helpers/editor';

/** The 17 safe members of the flow-adjacency family found while investigating #11. */
const tightCases: Array<[string, string, string?]> = [
  ['paragraph -> bullet list', 'alpha\n- a\n- b\n'],
  ['paragraph -> ordered list', 'alpha\n1. a\n2. b\n'],
  ['paragraph -> blockquote', 'alpha\n> quoted\n'],
  ['paragraph -> heading', 'alpha\n# Heading\n'],
  ['heading -> paragraph', '# Heading\ntext\n'],
  ['paragraph -> fenced code', 'alpha\n```js\nx\n```\n'],
  ['fenced code -> paragraph', '```js\nx\n```\nafter\n'],
  ['leading thematic break -> paragraph', '***\nalpha\n'],
  [
    'paragraph -> table',
    'alpha\n| a | b |\n| --- | --- |\n| 1 | 2 |\n',
    // GFM's table serializer deliberately chooses the minimum delimiter width; the
    // tight-flow assertion is that it does not also invent a blank line before the table.
    'alpha\n| a | b |\n| - | - |\n| 1 | 2 |\n'
  ],
  ['callout marker -> list', '> [!NOTE]\n> - a\n> - b\n'],
  ['blockquote paragraph -> nested quote', '> outer\n> > inner\n'],
  ['blockquote paragraph -> heading', '> intro\n> # Heading\n'],
  ['blockquote heading -> paragraph', '> # Heading\n> text\n'],
  ['list paragraph -> nested bullet list', '- intro\n  - nested\n'],
  ['list paragraph -> nested ordered list', '- intro\n  1. nested\n'],
  ['list paragraph -> blockquote', '- intro\n  > quoted\n'],
  ['blockquote fence -> paragraph', '> ```js\n> x\n> ```\n> after\n']
];

describe('tight flow round-trip (#11)', () => {
  for (const [name, markdown, expected = markdown] of tightCases) {
    it(`preserves ${name}`, async () => {
      const first = await roundTripDoc(markdown);
      expect(first.output).toBe(expected);
      const second = await roundTripDoc(first.output);
      expect(second.doc.toJSON()).toEqual(first.doc.toJSON());
    });
  }

  it('keeps ordinary intentional blank lines', async () => {
    const cases = [
      'alpha\n\n- a\n',
      '> a\n>\n> b\n',
      '- first\n\n  second paragraph\n'
    ];
    for (const markdown of cases) expect(await roundTrip(markdown)).toBe(markdown);
  });

  it('keeps the safety blank before a thematic break so it cannot become a setext heading', async () => {
    const first = await roundTripDoc('alpha\n***\n');
    expect(first.output).toBe('alpha\n\n---\n');
    const second = await roundTripDoc(first.output);
    expect(first.doc.childCount).toBe(2);
    expect(first.doc.child(1).type.name).toBe('hr');
    expect(second.doc.toJSON()).toEqual(first.doc.toJSON());
  });

  it('preserves the tight boundary through a real edit and undo', async () => {
    const markdown = '> [!NOTE]\n> - x\n\ntail\n';
    const { root, handle } = await mountEditor(markdown);
    const view = handle.getView();
    let tail = -1;
    view.state.doc.descendants((node, pos) => {
      if (tail < 0 && node.isText && node.text === 'tail') tail = pos + node.nodeSize;
      return tail < 0;
    });
    expect(tail).toBeGreaterThan(0);

    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, tail)).insertText('!')
    );
    expect(handle.getMarkdown()).toBe('> [!NOTE]\n> - x\n\ntail!\n');

    expect(undo(view.state, view.dispatch)).toBe(true);
    expect(handle.getMarkdown()).toBe(markdown);
    root.remove();
  });

  it('does not echo a tight document on load, but emits a tight document after an edit', async () => {
    const markdown = '> outer\n> > inner\n\ntail\n';
    const root = document.createElement('div');
    document.body.appendChild(root);
    const edits: string[] = [];
    const handle = await createOmdEditor({ root, initial: markdown, onEdit: (md) => edits.push(md) });

    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(edits).toEqual([]);

    const view = handle.getView();
    view.dispatch(view.state.tr.insertText('!', view.state.doc.content.size - 1));
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(edits).toEqual(['> outer\n> > inner\n\ntail!\n']);
    root.remove();
  });

  it('drops the seam when Alt+Down lands a tight block beside a different neighbour', async () => {
    // The carried boundary is sticky: `move-block.ts` reinserts the node object verbatim.
    // A bare tightness flag would emit `other\ntext`, which reopens as ONE paragraph.
    const markdown = '# Heading\ntext\n\nother\n';
    const { root, handle } = await mountEditor(markdown);
    const view = handle.getView();
    expect(handle.getMarkdown()).toBe(markdown);

    const inText = view.state.doc.child(0).nodeSize + 1;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, inText)));
    expect(moveBlock(1)(view)).toBe(true);

    const moved = handle.getMarkdown();
    expect(moved).toBe('# Heading\n\nother\n\ntext\n');
    const reopened = await roundTripDoc(moved);
    expect(reopened.doc.childCount).toBe(3);
    expect(reopened.output).toBe(moved);
    root.remove();
  });

  it('drops the seam for the half a split leaves behind another paragraph', async () => {
    const { root, handle } = await mountEditor('# Heading\nalphabeta\n');
    const view = handle.getView();
    const mid = view.state.doc.child(0).nodeSize + 1 + 'alpha'.length;
    view.dispatch(view.state.tr.split(mid));

    const split = handle.getMarkdown();
    expect(split).toBe('# Heading\nalpha\n\nbeta\n');
    expect((await roundTripDoc(split)).doc.childCount).toBe(3);
    root.remove();
  });

  it('drops the seam when emptying the first item leaves the list a bare marker', async () => {
    // `alpha\n-` is a setext heading and `alpha\n1.` is one paragraph, so a tight
    // `paragraph -> list` has to be re-checked against the list actually being written.
    const cases: Array<[string, string, string]> = [
      ['alpha\n- a\n', 'alpha\n\n-\n', 'bullet_list'],
      ['alpha\n1. a\n', 'alpha\n\n1.\n', 'ordered_list']
    ];
    for (const [markdown, expected, listType] of cases) {
      const { root, handle } = await mountEditor(markdown);
      const view = handle.getView();
      let item = -1;
      view.state.doc.descendants((node, pos) => {
        if (item < 0 && node.isText && node.text === 'a') item = pos;
        return item < 0;
      });
      view.dispatch(view.state.tr.delete(item, item + 1));

      const emptied = handle.getMarkdown();
      expect(emptied).toBe(expected);
      const reopened = await roundTripDoc(emptied);
      expect(
        Array.from({ length: reopened.doc.childCount }, (_, i) => reopened.doc.child(i).type.name)
      ).toEqual(['paragraph', listType]);
      root.remove();
    }
  });

  it('drops the seam between two lists of the same flavour', async () => {
    // Only the seam between the two lists gains a blank line; the trailing newline stays put.
    const cases: Array<[string, string]> = [
      ['- a\n* b\n', '- a\n\n* b\n'],
      ['1. a\n1) b\n', '1. a\n\n1) b\n']
    ];
    for (const [markdown, expected] of cases) {
      const first = await roundTripDoc(markdown);
      expect(first.doc.childCount).toBe(2);
      expect(first.output).toBe(expected);
      const second = await roundTripDoc(first.output);
      expect(second.doc.childCount).toBe(2);
      expect(second.output).toBe(first.output);
    }
  });

  it('keeps the seam between two lists that cannot merge', async () => {
    const first = await roundTripDoc('- a\n1. b\n');
    expect(first.output).toBe('- a\n1. b\n');
    const second = await roundTripDoc(first.output);
    expect(second.doc.toJSON()).toEqual(first.doc.toJSON());
  });

  it('preserves paragraph as the schema default block type', async () => {
    const { root, handle } = await mountEditor('');
    const { schema, doc } = handle.getView().state;
    expect(schema.topNodeType.contentMatch.defaultType?.name).toBe('paragraph');
    expect(doc.firstChild?.type.name).toBe('paragraph');
    root.remove();
  });
});
