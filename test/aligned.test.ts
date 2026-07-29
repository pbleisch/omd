import { describe, it, expect } from 'vitest';
import { pairAligned } from '../src/webview/plugins/aligned/transform';
import type { MdNode } from '../src/webview/plugins/shortcode/transform';
import { roundTrip, mountEditor } from './helpers/editor';
import { normalizeMarkdown } from '../src/shared/roundtrip';

/**
 * P4 GFM-visible coexistence (docs/design/FORMATS.md): image alignment lives on disk as a
 * `<div align="…">` that GitHub renders natively, so the image is visible to every reader
 * while OMD reads the alignment off the div. The construct must round-trip byte-for-byte.
 */

async function docTypes(md: string): Promise<string[]> {
  const { handle } = await mountEditor(md);
  const types: string[] = [];
  handle.getView().state.doc.descendants((n) => {
    types.push(n.type.name);
    return true;
  });
  return types;
}

describe('aligned pairing transform', () => {
  const html = (v: string): MdNode => ({ type: 'html', value: v });
  const para = (t: string): MdNode => ({ type: 'paragraph', children: [{ type: 'text', value: t }] });

  it('wraps content between a <div align> and its </div>', () => {
    const out = pairAligned([html('<div align="right">'), para('x'), html('</div>')]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: 'omdAligned', align: 'right' });
  });

  it('ignores a plain <div> with no align', () => {
    const nodes = [html('<div>'), para('x'), html('</div>')];
    expect(pairAligned(nodes)).toEqual(nodes);
  });

  it('balances a nested div', () => {
    const out = pairAligned([
      html('<div align="center">'),
      html('<div>'),
      para('x'),
      html('</div>'),
      html('</div>')
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('omdAligned');
  });
});

describe('aligned round-trip', () => {
  for (const align of ['left', 'center', 'right'] as const) {
    it(`align="${align}" round-trips`, async () => {
      const md = `<div align="${align}">\n\n![Logo](logo.png)\n\n</div>\n`;
      expect(normalizeMarkdown(await roundTrip(md))).toBe(normalizeMarkdown(md));
    });
  }

  it('becomes an aligned schema node wrapping the image', async () => {
    const types = await docTypes('<div align="center">\n\n![Logo](logo.png)\n\n</div>\n');
    expect(types[0]).toBe('aligned');
    expect(types).toContain('image');
  });

  it('leaves a plain <div> as untouched html', async () => {
    const md = '<div>\n\nplain\n\n</div>\n';
    expect(normalizeMarkdown(await roundTrip(md))).toBe(normalizeMarkdown(md));
    expect(await docTypes(md)).not.toContain('aligned');
  });
});

describe('aligned: <p align> wrapper (common README idiom)', () => {
  for (const align of ['left', 'center', 'right'] as const) {
    it(`<p align="${align}"> renders aligned and round-trips (tag preserved, not rewritten to div)`, async () => {
      const md = `<p align="${align}">\n\n![Logo](logo.png)\n\n</p>\n`;
      const types = await docTypes(md);
      expect(types[0]).toBe('aligned');
      expect(types).toContain('image');
      expect(types).not.toContain('html'); // rendered, not shown raw
      const out = await roundTrip(md);
      expect(normalizeMarkdown(out)).toBe(normalizeMarkdown(md));
      expect(out).toContain('<p align='); // re-emits the original <p> tag, never a <div>
    });
  }

  it('leaves a plain <p> as untouched html', async () => {
    const md = '<p>\n\nplain\n\n</p>\n';
    expect(await docTypes(md)).not.toContain('aligned');
  });
});
