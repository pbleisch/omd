import { describe, it, expect } from 'vitest';
import { parseTsv, singleUrl } from '../src/webview/plugins/smart-paste';

/**
 * P7 smart paste. ProseMirror already converts pasted HTML to nodes, so this only covers the
 * two cases it would otherwise flatten to text: tab-separated spreadsheet cells and a bare URL.
 * The detection has to be conservative — turning an ordinary paste into a table or link would
 * be worse than doing nothing — so these tests pin exactly what triggers.
 */

describe('spreadsheet cells → table', () => {
  it('parses a clean tab-separated grid', () => {
    expect(parseTsv('Name\tRole\nAlice\tAuthor\nBob\tEditor')).toEqual([
      ['Name', 'Role'],
      ['Alice', 'Author'],
      ['Bob', 'Editor']
    ]);
  });

  it('tolerates trailing newlines and CRLF', () => {
    expect(parseTsv('a\tb\r\nc\td\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd']
    ]);
  });

  it('rejects a single line (too ambiguous)', () => {
    expect(parseTsv('a\tb')).toBeNull();
  });

  it('rejects text with no tabs', () => {
    expect(parseTsv('just\nplain\nlines')).toBeNull();
  });

  it('rejects a ragged grid', () => {
    expect(parseTsv('a\tb\nc\td\te')).toBeNull();
  });

  it('rejects a single column even with tabs elsewhere', () => {
    expect(parseTsv('a\nb\nc')).toBeNull();
  });
});

describe('bare URL detection', () => {
  it('accepts a lone http(s) URL', () => {
    expect(singleUrl('https://example.com/path?q=1')).toBe('https://example.com/path?q=1');
    expect(singleUrl('  http://x.io  ')).toBe('http://x.io');
  });

  it('rejects text around a URL, or a non-URL', () => {
    expect(singleUrl('see https://x.com here')).toBeNull();
    expect(singleUrl('not a url')).toBeNull();
    expect(singleUrl('ftp://x.com')).toBeNull();
    expect(singleUrl('')).toBeNull();
  });
});
