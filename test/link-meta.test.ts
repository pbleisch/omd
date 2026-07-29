import { describe, it, expect } from 'vitest';
import { parseLinkMeta, hostnameOf } from '../src/shared/linkMeta';

/**
 * The pure OpenGraph/`<head>` parser behind the `linkcard` block (src/shared/linkMeta.ts). It runs
 * host-side on fetched HTML; keeping it pure means it's tested here with no network or DOM.
 */

const BASE = 'https://example.com/post';

describe('parseLinkMeta', () => {
  it('extracts OpenGraph title/description/image/site', () => {
    const html = `<html><head>
      <meta property="og:title" content="Example Post">
      <meta property="og:description" content="A short summary.">
      <meta property="og:image" content="https://cdn.example.com/og.png">
      <meta property="og:site_name" content="Example">
    </head><body>ignored</body></html>`;
    expect(parseLinkMeta(html, BASE)).toEqual({
      title: 'Example Post',
      description: 'A short summary.',
      image: 'https://cdn.example.com/og.png',
      site: 'Example'
    });
  });

  it('tolerates reversed attribute order and single quotes', () => {
    const html = `<head><meta content='Reversed' property='og:title'></head>`;
    expect(parseLinkMeta(html, BASE).title).toBe('Reversed');
  });

  it('resolves a relative og:image against the page URL', () => {
    const html = `<head><meta property="og:image" content="/img/hero.png"></head>`;
    expect(parseLinkMeta(html, BASE).image).toBe('https://example.com/img/hero.png');
  });

  it('falls back to <title> and meta description when OG is absent', () => {
    const html = `<head><title>Doc Title</title><meta name="description" content="Meta desc."></head>`;
    const meta = parseLinkMeta(html, BASE);
    expect(meta.title).toBe('Doc Title');
    expect(meta.description).toBe('Meta desc.');
    expect(meta.image).toBe('');
    expect(meta.site).toBe('example.com'); // hostname fallback
  });

  it('prefers OG over twitter over the document title', () => {
    const html = `<head>
      <title>Doc</title>
      <meta name="twitter:title" content="Tw">
      <meta property="og:title" content="OG">
    </head>`;
    expect(parseLinkMeta(html, BASE).title).toBe('OG');
  });

  it('decodes HTML entities in extracted content', () => {
    const html = `<head><meta property="og:title" content="Tom &amp; Jerry &#8212; &quot;Best&quot;"></head>`;
    expect(parseLinkMeta(html, BASE).title).toBe('Tom & Jerry — "Best"');
  });

  it('returns empty fields (site as hostname) for a document with no metadata', () => {
    expect(parseLinkMeta('<html><body>nothing</body></html>', BASE)).toEqual({
      title: '',
      description: '',
      image: '',
      site: 'example.com'
    });
  });
});

describe('hostnameOf', () => {
  it('strips a leading www.', () => {
    expect(hostnameOf('https://www.example.com/x')).toBe('example.com');
  });
  it('returns empty for a non-URL', () => {
    expect(hostnameOf('not a url')).toBe('');
  });
});
