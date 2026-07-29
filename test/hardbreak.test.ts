import { describe, it, expect } from 'vitest';
import { mountEditor, roundTrip } from './helpers/editor';
import { normalizeMarkdown } from '../src/shared/roundtrip';

/**
 * A literal `<br>` (the common GFM hard-break idiom) must survive the round-trip. It used to be
 * dropped outright (`a<br>b` → `ab`, silent data loss) or degraded to a soft break; the hardbreak
 * plugin preserves it as an `omdBr` node that renders as a real line break and re-emits the exact
 * bytes. Backslash / two-space breaks are left to their existing `\` normalization.
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

describe('literal <br> round-trip', () => {
  const forms = ['a<br>b\n', 'a<br/>b\n', 'a<br />b\n', 'a<BR>b\n', 'x<br>y<br>z\n', 'a<br>\nb\n'];
  for (const md of forms) {
    it(`${JSON.stringify(md)} comes back byte-for-byte`, async () => {
      expect(normalizeMarkdown(await roundTrip(md))).toBe(normalizeMarkdown(md));
    });
  }

  it('renders <br> as an omdBr node, not raw text or a dropped break', async () => {
    const types = await nodeTypes('a<br>b\n');
    expect(types).toContain('omdBr');
    expect(types).not.toContain('html');
  });

  it('leaves a backslash hard break as an ordinary hardbreak (unchanged)', async () => {
    const types = await nodeTypes('a\\\nb\n');
    expect(types).toContain('hardbreak');
    expect(types).not.toContain('omdBr');
    expect(normalizeMarkdown(await roundTrip('a\\\nb\n'))).toBe(normalizeMarkdown('a\\\nb\n'));
  });

  it('does not touch a plain paragraph', async () => {
    const types = await nodeTypes('just text\n');
    expect(types).not.toContain('omdBr');
  });
});
