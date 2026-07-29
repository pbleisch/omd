import { describe, it, expect } from 'vitest';
import { roundTrip, mountEditor } from './helpers/editor';
import { normalizeMarkdown } from '../src/shared/roundtrip';
import { parseParams } from '../src/shared/shortcode';
import {
  isHttpUrl,
  cardTitle,
  linkcardParams,
  fillInsertedLinkcard
} from '../src/webview/blocks/linkcard';
import type { LinkMeta } from '../src/shared/linkMeta';

/**
 * The `linkcard` built-in (docs/design/FORMATS.md coexistence form): a rich preview in OMD over a plain
 * `[title](url)` body a GitHub reader sees. The cached metadata lives in the shortcode params and
 * must round-trip byte-for-byte.
 */

const CARD =
  '<!-- omd:linkcard {"url":"https://example.com/post","title":"Example Post","description":"A short summary.","image":"https://example.com/og.png","site":"Example"} -->\n\n' +
  '[Example Post](https://example.com/post)\n\n' +
  '<!-- /omd:linkcard -->\n';

describe('linkcard helpers', () => {
  it('accepts only http(s) URLs', () => {
    expect(isHttpUrl('https://example.com')).toBe(true);
    expect(isHttpUrl('http://example.com')).toBe(true);
    expect(isHttpUrl('ftp://example.com')).toBe(false);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('not a url')).toBe(false);
  });

  it('cardTitle falls back to hostname then URL when no title is cached', () => {
    expect(cardTitle({ url: 'https://www.example.com/x', title: 'Set' })).toBe('Set');
    expect(cardTitle({ url: 'https://www.example.com/x' })).toBe('example.com');
  });

  it('linkcardParams omits empty fields but always keeps the url', () => {
    expect(linkcardParams('https://x.com', null)).toEqual({ url: 'https://x.com' });
    const meta: LinkMeta = { title: 'T', description: '', image: 'https://x.com/i.png', site: 'X' };
    expect(linkcardParams('https://x.com', meta)).toEqual({
      url: 'https://x.com',
      title: 'T',
      image: 'https://x.com/i.png',
      site: 'X'
    });
  });
});

describe('linkcard round-trip', () => {
  it('preserves the shortcode, cached params, and link body byte-for-byte', async () => {
    expect(normalizeMarkdown(await roundTrip(CARD))).toBe(normalizeMarkdown(CARD));
  });
});

describe('linkcard NodeView', () => {
  it('renders title, description, site, and image from the cached params', async () => {
    const { root } = await mountEditor(CARD);
    expect(root.querySelector('.omd-linkcard-title')?.textContent).toBe('Example Post');
    expect(root.querySelector('.omd-linkcard-desc')?.textContent).toBe('A short summary.');
    expect(root.querySelector('.omd-linkcard-site')?.textContent).toBe('Example');
    const img = root.querySelector<HTMLImageElement>('.omd-linkcard-image');
    expect(img?.getAttribute('src')).toBe('https://example.com/og.png');
    // The clickable card points at the URL; the GitHub-visible body link is hidden but present.
    expect(root.querySelector('a.omd-linkcard')?.getAttribute('href')).toBe('https://example.com/post');
  });

  it('shows the hostname as the title when only a URL is cached', async () => {
    const placeholder =
      '<!-- omd:linkcard {"url":"https://example.com/post"} -->\n\n[example.com](https://example.com/post)\n\n<!-- /omd:linkcard -->\n';
    const { root } = await mountEditor(placeholder);
    expect(root.querySelector('.omd-linkcard-title')?.textContent).toBe('example.com');
    expect(root.querySelector('.omd-linkcard-image')).toBeNull();
  });
});

describe('linkcard fill after fetch', () => {
  it('writes fetched metadata into the placeholder card and regenerates the body', async () => {
    const url = 'https://example.com/post';
    const placeholder =
      `<!-- omd:linkcard {"url":"${url}"} -->\n\n[example.com](${url})\n\n<!-- /omd:linkcard -->\n`;
    const { handle } = await mountEditor(placeholder);
    const view = handle.getView();

    const meta: LinkMeta = {
      title: 'Fetched Title',
      description: 'Fetched description.',
      image: 'https://example.com/og.png',
      site: 'Example'
    };
    fillInsertedLinkcard(view, url, meta);

    // params carry the cached metadata
    let updated: Record<string, unknown> = {};
    view.state.doc.descendants((node) => {
      if (node.type.name === 'shortcode_container' && node.attrs.name === 'linkcard') {
        updated = parseParams(node.attrs.params as string);
      }
    });
    expect(updated).toMatchObject({ url, title: 'Fetched Title', site: 'Example' });

    // the GitHub-visible body link text is regenerated to the new title
    const out = handle.getMarkdown();
    expect(out).toContain(`[Fetched Title](${url})`);
    expect(out).toContain('"title":"Fetched Title"');
  });
});
