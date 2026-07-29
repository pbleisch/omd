import { describe, it, expect } from 'vitest';
import { mountEditor, roundTrip } from './helpers/editor';
import { normalizeMarkdown } from '../src/shared/roundtrip';

/**
 * HTML entities & numeric character references must survive open→save. remark decodes `&copy;`→©,
 * `&nbsp;`→NBSP, `&#35;`→# at parse; the entities plugin preserves the raw `&…;` bytes as an
 * `omdEntity` node that renders the decoded character. (`&nbsp;` vs a plain space is a real semantic
 * difference, so this is genuine preservation, not just cosmetics.)
 */

async function nodeTypes(md: string): Promise<string[]> {
  const { handle } = await mountEditor(md);
  const types: string[] = [];
  handle.getView().state.doc.descendants((n) => {
    types.push(n.type.name);
    return true;
  });
  return types;
}

describe('entity round-trip', () => {
  const cases = [
    'a &copy; b\n', // named
    'price &#35; and &#36;\n', // decimal numeric
    'star &#x2A; here\n', // hex numeric
    'non&nbsp;breaking\n', // nbsp — a real semantic char, not a space
    '&nbsp; &amp; &copy; &AElig;\n', // several in a row
    'X&AElig;Y\n' // adjacent to text, no spaces
  ];
  for (const md of cases) {
    it(`${JSON.stringify(md)} comes back byte-for-byte`, async () => {
      expect(normalizeMarkdown(await roundTrip(md))).toBe(normalizeMarkdown(md));
    });
  }

  it('renders an omdEntity node (the decoded character), not raw text', async () => {
    const { root, handle } = await mountEditor('a &copy; b\n');
    const types: string[] = [];
    handle.getView().state.doc.descendants((n) => {
      types.push(n.type.name);
      return true;
    });
    expect(types).toContain('omdEntity');
    expect(root.querySelector('.omd-entity')?.textContent).toBe('©');
  });

  it('leaves a bare & (not an entity) as ordinary text', async () => {
    expect(await nodeTypes('this & that\n')).not.toContain('omdEntity');
  });

  it('does not touch entities inside inline code (already literal)', async () => {
    const md = 'use `&copy;` literally\n';
    expect(await nodeTypes(md)).not.toContain('omdEntity');
    expect(normalizeMarkdown(await roundTrip(md))).toBe(normalizeMarkdown(md));
  });
});
