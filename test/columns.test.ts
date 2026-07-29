import { describe, it, expect } from 'vitest';
import { pairColumns } from '../src/webview/plugins/columns/transform';
import type { MdNode } from '../src/webview/plugins/shortcode/transform';
import { roundTrip, mountEditor } from './helpers/editor';
import { normalizeMarkdown } from '../src/shared/roundtrip';
import { setBlocks } from '../src/webview/blocks/registry';
import { blockInsertCommands } from '../src/webview/blocks/insert';
import { SHIPPED_BLOCKS } from '../src/shared/blocks';

/**
 * P5 `2col` / `3col`. The on-disk form is a raw HTML table with markdown cells, which GitHub
 * renders as real columns — the machinery *is* the plain rendering (docs/design/FORMATS.md). Empty
 * cells are `&nbsp;`, which needs care: remark decodes the entity on the way in, so the
 * serializer has to write it back or an empty column would not round-trip.
 */

const OPEN = '<table><tr><td>';
const SEP = '</td><td>';
const CLOSE = '</td></tr></table>';

describe('columns pairing transform', () => {
  const html = (v: string): MdNode => ({ type: 'html', value: v });
  const para = (t: string): MdNode => ({ type: 'paragraph', children: [{ type: 'text', value: t }] });

  it('splits the span into one column per cell', () => {
    const out = pairColumns([html(OPEN), para('a'), html(SEP), para('b'), html(CLOSE)]);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('omdColumns');
    const cells = out[0].children as MdNode[];
    expect(cells).toHaveLength(2);
    expect(cells[0]).toMatchObject({ type: 'omdColumn', sepRaw: '' });
    expect(cells[1]).toMatchObject({ type: 'omdColumn', sepRaw: SEP });
  });

  it('handles three columns', () => {
    const out = pairColumns([
      html(OPEN), para('a'), html(SEP), para('b'), html(SEP), para('c'), html(CLOSE)
    ]);
    expect((out[0].children as MdNode[])).toHaveLength(3);
  });

  it('leaves an unclosed table alone', () => {
    const nodes = [html(OPEN), para('a')];
    expect(pairColumns(nodes)).toEqual(nodes);
  });

  it('ignores an ordinary html block', () => {
    const nodes = [html('<div>'), para('a'), html('</div>')];
    expect(pairColumns(nodes)).toEqual(nodes);
  });
});

describe('columns round-trip', () => {
  const cases: Array<[string, string]> = [
    [
      'two columns',
      `${OPEN}\n\nLeft **bold**.\n\n${SEP}\n\nRight.\n\n${CLOSE}\n`
    ],
    [
      'three columns',
      `${OPEN}\n\nOne.\n\n${SEP}\n\nTwo.\n\n${SEP}\n\nThree.\n\n${CLOSE}\n`
    ],
    [
      'rich cell content',
      `${OPEN}\n\n### Heading\n\n- one\n- two\n\n${SEP}\n\n\`\`\`ts\nconst a = 1;\n\`\`\`\n\n${CLOSE}\n`
    ],
    ['empty cell keeps its &nbsp;', `${OPEN}\n\nLeft.\n\n${SEP}\n\n&nbsp;\n\n${CLOSE}\n`]
  ];
  for (const [name, md] of cases) {
    it(name, async () => {
      expect(normalizeMarkdown(await roundTrip(md))).toBe(normalizeMarkdown(md));
    });
  }

  it('builds columns/column nodes wrapping real markdown', async () => {
    const { handle } = await mountEditor(`${OPEN}\n\nLeft.\n\n${SEP}\n\nRight.\n\n${CLOSE}\n`);
    const doc = handle.getView().state.doc;
    expect(doc.child(0).type.name).toBe('columns');
    expect(doc.child(0).childCount).toBe(2);
    expect(doc.child(0).child(0).type.name).toBe('column');
  });
});

describe('columns insertion', () => {
  for (const [id, count] of [['block-2col', 2], ['block-3col', 3]] as const) {
    it(`${id} inserts ${count} columns that round-trip`, async () => {
      const { handle } = await mountEditor('start\n');
      setBlocks(SHIPPED_BLOCKS);
      const view = handle.getView();
      blockInsertCommands(view.state.schema).find((c) => c.id === id)!.run(view);

      const out = normalizeMarkdown(handle.getMarkdown());
      expect(out).toContain(OPEN);
      expect(out).toContain(CLOSE);
      // Empty cells serialize as `&nbsp;`, one separator fewer than the column count.
      expect(out.split(SEP).length - 1).toBe(count - 1);
      expect(normalizeMarkdown(await roundTrip(out))).toBe(out);
    });
  }
});
