import { describe, it, expect } from 'vitest';
import { mountEditor, roundTrip } from './helpers/editor';
import { nextFootnoteLabel, insertFootnote } from '../src/webview/blocks/footnote';
import { normalizeMarkdown } from '../src/shared/roundtrip';
import { setBlocks } from '../src/webview/blocks/registry';
import { blockInsertCommands } from '../src/webview/blocks/insert';
import { SHIPPED_BLOCKS } from '../src/shared/blocks';

/**
 * P5 `footnote` and `tabs`. Footnotes are native GFM the preset already parses, so the block
 * only adds correct numbering and placement. Tabs need no new on-disk format either — they
 * are nested shortcode containers, which already round-trip.
 */

describe('footnote block', () => {
  it('numbers the next footnote past any existing one', async () => {
    const { handle } = await mountEditor('a[^1] b[^2]\n\n[^1]: one\n\n[^2]: two\n');
    expect(nextFootnoteLabel(handle.getView().state.doc)).toBe('3');
  });

  it('ignores non-numeric labels when numbering', async () => {
    const { handle } = await mountEditor('a[^note]\n\n[^note]: text\n');
    expect(nextFootnoteLabel(handle.getView().state.doc)).toBe('1');
  });

  it('inserts a reference and a matching definition that round-trip', async () => {
    const { handle } = await mountEditor('A claim.\n');
    const view = handle.getView();
    // Put the cursor at the end of the sentence.
    const end = view.state.doc.child(0).nodeSize - 1;
    view.dispatch(
      view.state.tr.setSelection(
        (await import('prosemirror-state')).TextSelection.near(view.state.doc.resolve(end))
      )
    );
    expect(insertFootnote(view)).toBe(true);

    const out = normalizeMarkdown(handle.getMarkdown());
    expect(out).toContain('[^1]');
    expect(out).toContain('[^1]:');
    expect(normalizeMarkdown(await roundTrip(out))).toBe(out);
  });

  const footnoteCases: Array<[string, string]> = [
    ['numeric', 'Some claim.[^1]\n\n[^1]: The supporting note.\n'],
    ['named', 'Some claim.[^note]\n\n[^note]: The supporting note.\n'],
    ['two references', 'A[^1] and B[^2]\n\n[^1]: one\n\n[^2]: two\n']
  ];
  for (const [name, md] of footnoteCases) {
    it(`round-trips (${name})`, async () => {
      expect(normalizeMarkdown(await roundTrip(md))).toBe(normalizeMarkdown(md));
    });
  }
});

describe('tabs block', () => {
  const md = [
    '<!-- omd:tabs {} -->',
    '',
    '<!-- omd:tab {"label":"First"} -->',
    '',
    'Content one.',
    '',
    '<!-- /omd:tab -->',
    '',
    '<!-- omd:tab {"label":"Second"} -->',
    '',
    'Content **two**.',
    '',
    '<!-- /omd:tab -->',
    '',
    '<!-- /omd:tabs -->',
    ''
  ].join('\n');

  it('round-trips as nested shortcode containers', async () => {
    expect(normalizeMarkdown(await roundTrip(md))).toBe(normalizeMarkdown(md));
  });

  it('parses into a tabs container holding tab containers', async () => {
    const { handle } = await mountEditor(md);
    const doc = handle.getView().state.doc;
    const tabs = doc.child(0);
    expect(tabs.type.name).toBe('shortcode_container');
    expect(tabs.attrs.name).toBe('tabs');
    expect(tabs.childCount).toBe(2);
    expect(tabs.child(0).attrs.name).toBe('tab');
    expect(JSON.parse(tabs.child(1).attrs.params).label).toBe('Second');
  });

  it('inserts two labelled tabs that round-trip', async () => {
    const { handle } = await mountEditor('start\n');
    setBlocks(SHIPPED_BLOCKS);
    const view = handle.getView();
    blockInsertCommands(view.state.schema).find((c) => c.id === 'block-tabs')!.run(view);

    const out = normalizeMarkdown(handle.getMarkdown());
    expect(out).toContain('<!-- omd:tabs {} -->');
    expect(out).toContain('<!-- omd:tab {"label":"First"} -->');
    expect(out).toContain('<!-- omd:tab {"label":"Second"} -->');
    expect(out).toContain('<!-- /omd:tabs -->');
    expect(normalizeMarkdown(await roundTrip(out))).toBe(out);
  });
});
