import { describe, it, expect } from 'vitest';
import { mountEditor } from './helpers/editor';
import { headingSlug, documentHeadings } from '../src/webview/blocks/anchors';

/** Heading anchors for `#` autocomplete — GitHub-compatible slugs, with collision de-duping. */

describe('headingSlug', () => {
  it('lowercases, strips punctuation, and dashes spaces (GitHub-style)', () => {
    expect(headingSlug('Hello, World!')).toBe('hello-world');
    // GitHub does not collapse runs of spaces — each becomes a dash.
    expect(headingSlug('  Getting   Started  ')).toBe('getting---started');
    expect(headingSlug('API & SDK v2')).toBe('api--sdk-v2');
  });
});

describe('documentHeadings', () => {
  it('collects headings with de-duplicated slugs', async () => {
    const { handle } = await mountEditor('# My Heading!\n\n## Sub\n\ntext\n\n## Sub\n');
    const anchors = documentHeadings(handle.getView().state.doc);
    expect(anchors.map((a) => a.slug)).toEqual(['my-heading', 'sub', 'sub-1']);
    expect(anchors.map((a) => a.text)).toEqual(['My Heading!', 'Sub', 'Sub']);
    expect(anchors.map((a) => a.level)).toEqual([1, 2, 2]);
  });
});
