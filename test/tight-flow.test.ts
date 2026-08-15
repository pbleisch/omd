import { describe, expect, it } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { undo } from 'prosemirror-history';
import { createOmdEditor } from '../src/webview/editor';
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

  it('preserves paragraph as the schema default block type', async () => {
    const { root, handle } = await mountEditor('');
    const { schema, doc } = handle.getView().state;
    expect(schema.topNodeType.contentMatch.defaultType?.name).toBe('paragraph');
    expect(doc.firstChild?.type.name).toBe('paragraph');
    root.remove();
  });
});
