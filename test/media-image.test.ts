import { describe, it, expect } from 'vitest';
import { roundTrip } from './helpers/editor';
import {
  standaloneImg,
  standaloneFigure,
  figureCaption,
  imgAttr,
  buildImgRaw,
  buildMediaRaw
} from '../src/webview/plugins/media/transform';
import { snapWidth } from '../src/webview/plugins/media/view';
import type { MdNode } from '../src/webview/plugins/shortcode/transform';

/**
 * Media step 1 — the round-trip spine. A sized `<img>` is lifted into an `omdImage` node and must
 * re-emit the exact bytes; a bare `![](url)` must stay plain markdown, untouched.
 */

describe('media image round-trip', () => {
  const stable = [
    '<img src="cat.png" width="300" alt="a cat">\n',
    '<img src="cat.png" alt="a cat" width="300" />\n',
    '<img src="https://x/y.png" width="50%">\n',
    '![a cat](cat.png)\n', // bare image stays plain markdown (no gratuitous HTML)
    'Text with an ![inline](x.png) image.\n', // inline image untouched
    'A sentence with <img src="x.png" width="20"> mid-line stays opaque.\n' // non-standalone
  ];
  for (const md of stable) {
    it(`round-trips: ${JSON.stringify(md)}`, async () => {
      expect(await roundTrip(md)).toBe(md);
    });
  }

  it('a sized image inside <div align> round-trips (nested coexistence forms)', async () => {
    const md = '<div align="center">\n\n<img src="cat.png" width="300" alt="a cat">\n\n</div>\n';
    expect(await roundTrip(md)).toBe(md);
  });

  it('a captioned <figure> round-trips (multi-line and single-line)', async () => {
    const multi =
      '<figure>\n  <img src="cat.png" width="300" alt="a cat">\n  <figcaption>A cat</figcaption>\n</figure>\n';
    expect(await roundTrip(multi)).toBe(multi);
    const single = '<figure><img src="cat.png" width="300"><figcaption>A cat</figcaption></figure>\n';
    expect(await roundTrip(single)).toBe(single);
  });
});

describe('media transform helpers', () => {
  const img = '<img src="cat.png" width="300" alt="a cat">';

  it('recognizes a standalone <img> as a block html node', () => {
    expect(standaloneImg({ type: 'html', value: img } as MdNode)).toBe(img);
  });

  it('recognizes a standalone <img> wrapped in a paragraph', () => {
    const node: MdNode = { type: 'paragraph', children: [{ type: 'html', value: img }] };
    expect(standaloneImg(node)).toBe(img);
  });

  it('does not treat an <img> with trailing text as standalone', () => {
    const node: MdNode = {
      type: 'paragraph',
      children: [{ type: 'html', value: img }, { type: 'text', value: ' caption' }]
    };
    expect(standaloneImg(node)).toBeNull();
  });

  it('reads attributes in either quote style', () => {
    expect(imgAttr(img, 'width')).toBe('300');
    expect(imgAttr("<img src='a.png' width='42'>", 'width')).toBe('42');
    expect(imgAttr(img, 'height')).toBeNull();
  });
});

describe('media resize helpers', () => {
  it('builds canonical <img> bytes (src, width, alt order; alt omitted when empty)', () => {
    expect(buildImgRaw({ src: 'cat.png', width: '300', alt: 'a cat' })).toBe(
      '<img src="cat.png" width="300" alt="a cat">'
    );
    expect(buildImgRaw({ src: 'cat.png', width: '100%' })).toBe('<img src="cat.png" width="100%">');
    expect(buildImgRaw({ src: 'a"b.png', width: '50' })).toBe('<img src="a&quot;b.png" width="50">');
  });

  it('a regenerated raw re-parses to the same node and round-trips', async () => {
    // buildImgRaw's output is itself a valid standalone image that survives a round-trip.
    const md = buildImgRaw({ src: 'cat.png', width: '400', alt: 'a cat' }) + '\n';
    expect(await roundTrip(md)).toBe(md);
  });

  it('snaps to full, stock sizes within tolerance, else custom px', () => {
    expect(snapWidth(1000, 1000)).toBe('100%'); // at container width
    expect(snapWidth(995, 1000)).toBe('100%'); // within 2%
    expect(snapWidth(408, 1000)).toBe('400'); // within 16px of a stock size
    expect(snapWidth(300, 1000)).toBe('300'); // no stock nearby -> custom
  });
});

describe('media caption forms', () => {
  it('buildMediaRaw picks figure / img / bare by which attrs are set', () => {
    expect(buildMediaRaw({ src: 'c.png', width: '300', alt: 'a', caption: 'Hi' })).toBe(
      '<figure>\n  <img src="c.png" width="300" alt="a">\n  <figcaption>Hi</figcaption>\n</figure>'
    );
    expect(buildMediaRaw({ src: 'c.png', width: '300', alt: 'a' })).toBe(
      '<img src="c.png" width="300" alt="a">'
    );
    // Neither width nor caption -> back to bare markdown.
    expect(buildMediaRaw({ src: 'c.png', alt: 'a' })).toBe('![a](c.png)');
  });

  it('escapes < & > in the caption text', () => {
    expect(buildMediaRaw({ src: 'c.png', width: '1', caption: 'a<b>&c' })).toContain(
      '<figcaption>a&lt;b&gt;&amp;c</figcaption>'
    );
  });

  it('standaloneFigure detects a figure with an image; figureCaption reads it back', () => {
    const fig = '<figure><img src="c.png" width="9"><figcaption>a&lt;b&gt;</figcaption></figure>';
    expect(standaloneFigure({ type: 'html', value: fig } as MdNode)).toBe(fig);
    expect(figureCaption(fig)).toBe('a<b>'); // unescaped
    expect(standaloneFigure({ type: 'html', value: '<figure>no image here</figure>' } as MdNode)).toBeNull();
  });
});
