import { describe, it, expect } from 'vitest';
import { mountEditor, roundTrip } from './helpers/editor';
import { detectAutolink, hrefForLiteral } from '../src/webview/plugins/autolinks';

/**
 * #24a: bare URLs must round-trip byte-for-byte (GFM autolink-literals would otherwise be
 * rewritten as `<url>` / `[www.x](http://www.x)` on save), while still rendering as real,
 * editable, clickable link marks. Explicit `<url>` and `[label](url)` links are untouched.
 */

describe('bare URLs round-trip byte-for-byte (#24a)', () => {
  const stable = [
    'Visit https://example.com for more.\n',
    'Visit <https://example.com> for more.\n',
    'A bare www.example.com link.\n',
    'Email me at bob@example.com please.\n',
    'A [labeled](https://example.com) link.\n',
    'Multiple https://a.com and https://b.com here.\n',
    'Wikipedia https://en.wikipedia.org/wiki/Foo_(bar) link.\n',
    'Query https://example.com/search?q=a_b*c&x=1 end.\n',
    'Trailing https://example.com. Then more.\n',
    'Path https://example.com/a_b_c/d here.\n'
  ];
  for (const md of stable) {
    it(`preserves ${JSON.stringify(md)}`, async () => {
      expect(await roundTrip(md)).toBe(md);
    });
  }
});

describe('bare URLs render as editable, clickable link marks (#24a)', () => {
  it('a bare URL is an <a> with href, not a non-editable atom', async () => {
    const { root } = await mountEditor('See https://example.com now.\n');
    const a = root.querySelector('a.omd-autolink');
    expect(a).toBeTruthy();
    expect(a?.getAttribute('href')).toBe('https://example.com');
    expect(a?.textContent).toBe('https://example.com');
    // It's a mark over real text — nothing on the path opts out of editing.
    expect(root.querySelector('a.omd-autolink[contenteditable="false"]')).toBeNull();
  });

  it('derives mailto:/http: hrefs for email and www literals', async () => {
    const email = await mountEditor('Ping bob@example.com today.\n');
    expect(email.root.querySelector('a.omd-autolink')?.getAttribute('href')).toBe('mailto:bob@example.com');
    const www = await mountEditor('Go to www.example.com please.\n');
    expect(www.root.querySelector('a.omd-autolink')?.getAttribute('href')).toBe('http://www.example.com');
  });

  it('leaves explicit <url> and [label](url) as ordinary links, not autolink marks', async () => {
    const explicit = await mountEditor('Explicit <https://example.org> here.\n');
    expect(explicit.root.querySelector('a.omd-autolink')).toBeNull();
    expect(explicit.root.querySelector('a[href="https://example.org"]')).toBeTruthy();

    const labeled = await mountEditor('A [label](https://example.net) link.\n');
    expect(labeled.root.querySelector('a.omd-autolink')).toBeNull();
  });
});

describe('live-typing autolink detection (#24b)', () => {
  it('detects a bare URL finished with a space and derives its href', () => {
    expect(detectAutolink('see https://example.com ')).toEqual({
      url: 'https://example.com',
      href: 'https://example.com'
    });
    expect(detectAutolink('go www.foo.com ')).toEqual({ url: 'www.foo.com', href: 'http://www.foo.com' });
    expect(detectAutolink('ping a@b.com ')).toEqual({ url: 'a@b.com', href: 'mailto:a@b.com' });
  });

  it('trims trailing sentence punctuation from the link', () => {
    expect(detectAutolink('end https://trail.com. ')).toEqual({
      url: 'https://trail.com',
      href: 'https://trail.com'
    });
  });

  it('does not fire without a trailing space or on non-URLs', () => {
    expect(detectAutolink('https://example.com')).toBeNull(); // no trigger yet
    expect(detectAutolink('just some words ')).toBeNull();
    expect(detectAutolink('not.a.url.but.dotted ')).toBeNull();
  });

  it('hrefForLiteral mirrors GFM scheme derivation', () => {
    expect(hrefForLiteral('https://x.com')).toBe('https://x.com');
    expect(hrefForLiteral('www.x.com')).toBe('http://www.x.com');
    expect(hrefForLiteral('a@x.com')).toBe('mailto:a@x.com');
  });
});
