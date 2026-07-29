import { describe, it, expect } from 'vitest';
import {
  parseYouTubeId,
  youTubeThumbnail,
  youTubeWatchUrl,
  parseImageList
} from '../src/webview/blocks/media';
import { roundTrip, mountEditor } from './helpers/editor';
import { normalizeMarkdown } from '../src/shared/roundtrip';

/**
 * P5 media blocks. The body carries real image/thumbnail markdown so the media shows up for
 * every reader, not just in OMD (docs/design/FORMATS.md) — these tests pin both the URL handling and
 * the fact that the serialized body is genuinely renderable markdown.
 */

describe('youtube url parsing', () => {
  const id = 'dQw4w9WgXcQ';
  const cases: Array<[string, string | null]> = [
    [`https://youtu.be/${id}`, id],
    [`https://www.youtube.com/watch?v=${id}`, id],
    [`https://youtube.com/watch?v=${id}&t=30s`, id],
    [`https://m.youtube.com/watch?v=${id}`, id],
    [`https://www.youtube.com/embed/${id}`, id],
    [`https://www.youtube.com/shorts/${id}`, id],
    [`https://www.youtube-nocookie.com/embed/${id}`, id],
    [id, id], // a bare id is accepted
    ['https://vimeo.com/12345', null],
    ['https://youtu.be/tooshort', null],
    ['not a url', null]
  ];
  for (const [input, expected] of cases) {
    it(`${input} → ${expected ?? 'null'}`, () => {
      expect(parseYouTubeId(input)).toBe(expected);
    });
  }

  it('derives the thumbnail and watch URL without fetching anything', () => {
    expect(youTubeThumbnail(id)).toBe(`https://img.youtube.com/vi/${id}/hqdefault.jpg`);
    expect(youTubeWatchUrl(id)).toBe(`https://youtu.be/${id}`);
  });
});

describe('image list parsing', () => {
  it('splits on commas and newlines, dropping blanks', () => {
    expect(parseImageList('a.png, b.png\n\nc.png ,')).toEqual(['a.png', 'b.png', 'c.png']);
    expect(parseImageList('   ')).toEqual([]);
  });
});

describe('media round-trip', () => {
  const id = 'dQw4w9WgXcQ';
  const youtube = [
    `<!-- omd:youtube {"url":"https://youtu.be/${id}"} -->`,
    '',
    `[![Watch on YouTube](https://img.youtube.com/vi/${id}/hqdefault.jpg)](https://youtu.be/${id})`,
    '',
    '<!-- /omd:youtube -->',
    ''
  ].join('\n');

  const gallery = [
    '<!-- omd:gallery {"count":2} -->',
    '',
    '![Image 1](one.png)',
    '',
    '![Image 2](two.png)',
    '',
    '<!-- /omd:gallery -->',
    ''
  ].join('\n');

  it('youtube round-trips with its clickable thumbnail body', async () => {
    expect(normalizeMarkdown(await roundTrip(youtube))).toBe(normalizeMarkdown(youtube));
  });

  it('gallery round-trips with its image body', async () => {
    expect(normalizeMarkdown(await roundTrip(gallery))).toBe(normalizeMarkdown(gallery));
  });

  it('youtube round-trips with width/caption params inside an alignment wrapper', async () => {
    const md = [
      '<div align="right">',
      '',
      `<!-- omd:youtube {"url":"https://youtu.be/${id}","width":"400","caption":"Rickroll"} -->`,
      '',
      `[![Watch on YouTube](https://img.youtube.com/vi/${id}/hqdefault.jpg)](https://youtu.be/${id})`,
      '',
      '<!-- /omd:youtube -->',
      '',
      '</div>',
      ''
    ].join('\n');
    expect(normalizeMarkdown(await roundTrip(md))).toBe(normalizeMarkdown(md));
  });

  it('the youtube body is a real linked image, not opaque machinery', async () => {
    const { handle } = await mountEditor(youtube);
    const doc = handle.getView().state.doc;
    const container = doc.child(0);
    expect(container.attrs.name).toBe('youtube');

    let image: { attrs: Record<string, unknown>; marks: readonly { type: { name: string } }[] } | null = null;
    container.descendants((n) => {
      if (n.type.name === 'image') image = n as never;
      return true;
    });
    expect(image).toBeTruthy();
    expect(String(image!.attrs.src)).toContain('img.youtube.com');
    // The thumbnail is wrapped in a link, which is what makes it clickable on GitHub.
    expect(image!.marks.some((m) => m.type.name === 'link')).toBe(true);
  });

  it('the gallery body holds one real image per item', async () => {
    const { handle } = await mountEditor(gallery);
    let images = 0;
    handle.getView().state.doc.descendants((n) => {
      if (n.type.name === 'image') images++;
      return true;
    });
    expect(images).toBe(2);
  });
});
