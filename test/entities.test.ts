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

  /**
   * Issue #29: the raw source re-slice used to preserve entity spelling also carried the backslash
   * escapes the parser had already consumed, so they re-entered as literal content and were escaped
   * again on save — doubling every generation, unbounded. One round trip is not enough to catch it
   * (some of these are stable between gen 0 and gen 1), so iterate.
   */
  describe('escapes next to an entity do not grow (issue #29)', () => {
    const cases = [
      'a \\&amp; b\n', // `\&` is an escaped ampersand, not an entity
      'a \\* b &amp; c\n', // escape and entity in the same run
      'a \\_x\\_ &copy;\n', // two escapes, one entity
      'a \\* b\n', // control: escape, no entity
      'plain &copy; only\n' // control: entity, no escape
    ];
    for (const md of cases) {
      it(`${JSON.stringify(md)} is byte-stable over five generations`, async () => {
        let current = md;
        for (let generation = 1; generation <= 5; generation++) {
          current = await roundTrip(current);
          expect(normalizeMarkdown(current), `generation ${generation}`).toBe(normalizeMarkdown(md));
        }
      });
    }
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
