import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { roundTrip } from './helpers/editor';
import { normalizeMarkdown, roundTripEqual } from '../src/shared/roundtrip';

/**
 * The enforcement of Principle 2: open a document, save with no edit, get it back.
 * Every construct OMD supports earns a row here. A regression in this suite is a
 * release blocker — it means portability quietly broke.
 */

const corpusDir = join(__dirname, 'corpus');
const corpus = readdirSync(corpusDir).filter((f) => f.endsWith('.md'));

describe('round-trip: corpus files', () => {
  for (const file of corpus) {
    it(`${file} comes back byte-identical (normalized)`, async () => {
      const input = readFileSync(join(corpusDir, file), 'utf8');
      const output = await roundTrip(input);
      // Show a readable diff on failure by comparing the normalized forms directly.
      expect(normalizeMarkdown(output)).toBe(normalizeMarkdown(input));
    });
  }
});

describe('round-trip: inline cases', () => {
  const cases: Array<[string, string]> = [
    ['bold + italic', 'A **bold** and _italic_ line.\n'],
    ['inline code', 'Some `code` inline.\n'],
    ['nested list', '- a\n  - b\n    - c\n'],
    ['ordered list', '1. one\n2. two\n3. three\n'],
    ['blockquote', '> quoted line\n'],
    ['fenced code', '```js\nconst a = 1;\n```\n'],
    ['table', '| a | b |\n| --- | --- |\n| 1 | 2 |\n'],
    ['heading levels', '# h1\n\n## h2\n\n### h3\n'],
    ['thematic break', 'above\n\n---\n\nbelow\n']
  ];
  for (const [name, md] of cases) {
    it(name, async () => {
      const output = await roundTrip(md);
      expect(roundTripEqual(output, md)).toBe(true);
    });
  }
});

describe('normalizeMarkdown', () => {
  it('collapses blank-line runs and trailing whitespace', () => {
    expect(normalizeMarkdown('a  \n\n\n\nb')).toBe('a\n\nb\n');
  });
  it('normalizes CRLF', () => {
    expect(normalizeMarkdown('a\r\nb')).toBe('a\nb\n');
  });
});
