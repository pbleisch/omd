import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { roundTrip, roundTripDoc } from './helpers/editor';
import { normalizeMarkdown, roundTripEqual } from '../src/shared/roundtrip';

/**
 * The enforcement of Principle 2: open a document, save with no edit, get it back.
 * Every construct OMD supports earns a row here. A regression in this suite is a
 * release blocker — it means portability quietly broke.
 *
 * Two assertions, because bytes alone are not enough (hard gate 1):
 *
 *   - **bytes** — `serialize(parse(text)) ≡ text` after whitespace normalization. What a
 *     writer sees in `git diff` after opening and saving a file they did not edit.
 *   - **parse** — `parse(serialize(D)) ≡ D`. Output that re-parses to a *different*
 *     document destroys the file while passing the byte check: a leading `---` that
 *     reopens as front matter (#23), an escape dropped from a table cell that splits the
 *     row (#30). Both were byte-stable and both were data loss.
 *
 * Both run over the whole repository, not a hand-picked corpus. `test/corpus/` covers the
 * constructs someone remembered to write down; the repository's own 51 markdown files are
 * what OMD is actually asked to open, and they are the honest measure of gate 1.
 */

const repoRoot = join(__dirname, '..');
// Build output and dependencies are not documents anyone opens in OMD.
const skipDirs = new Set(['node_modules', '.git', '.vscode-test', 'dist', 'out']);

function markdownFilesUnder(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir).sort()) {
    if (skipDirs.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) markdownFilesUnder(path, found);
    else if (entry.endsWith('.md')) found.push(path);
  }
  return found;
}

/**
 * Both halves of gate 1 over one document.
 *
 * The parse half compares `toJSON()`, not `Node.eq()`: each mount builds its own `Schema`,
 * so two structurally identical documents hold different `NodeType` objects and `eq()` — an
 * identity comparison — is false for every pair. The JSON carries the node types by name
 * plus every attribute and mark, which is exactly the comparison this needs.
 */
async function expectRoundTrips(input: string): Promise<void> {
  const first = await roundTripDoc(input);
  // Show a readable diff on failure by comparing the normalized forms directly.
  expect(normalizeMarkdown(first.output)).toBe(normalizeMarkdown(input));
  const second = await roundTripDoc(first.output);
  expect(second.doc.toJSON()).toEqual(first.doc.toJSON());
}

const corpusDir = join(__dirname, 'corpus');
const corpus = readdirSync(corpusDir).filter((f) => f.endsWith('.md'));

describe('round-trip: corpus files', () => {
  for (const file of corpus) {
    it(`${file} comes back byte-identical and re-parses the same`, async () => {
      await expectRoundTrips(readFileSync(join(corpusDir, file), 'utf8'));
    });
  }
});

describe('round-trip: every markdown file in the repository', () => {
  const files = markdownFilesUnder(repoRoot);

  it('finds the repository documentation', () => {
    // A walk that silently stops finding files would turn this whole suite green for the
    // wrong reason.
    expect(files.length).toBeGreaterThan(40);
  });

  for (const path of files) {
    const name = relative(repoRoot, path).split(sep).join('/');
    it(`${name} comes back byte-identical and re-parses the same`, async () => {
      await expectRoundTrips(readFileSync(path, 'utf8'));
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

  // #32: the delimiter row's *padding* was not normalized, only its dash count, so a compact
  // hand-authored table read as divergent against remark's padded output and the host's loop
  // guard rewrote a table nobody touched.
  it('makes a compact delimiter row equal to remark padded output', () => {
    const compact = '| a | b |\n|---|---|\n| 1 | 2 |\n';
    const padded = '| a | b |\n| --- | --- |\n| 1 | 2 |\n';
    expect(roundTripEqual(compact, padded)).toBe(true);
  });
  it('preserves alignment colons while normalizing delimiter padding', () => {
    expect(normalizeMarkdown('|:--|--:|:-:|--|\n')).toBe('| :--- | ---: | :---: | --- |\n');
    expect(roundTripEqual('|:---|---:|\n', '| :--- | ---: |\n')).toBe(true);
    // Alignment itself is still meaningful: left-aligned is not right-aligned.
    expect(roundTripEqual('|:---|\n', '|---:|\n')).toBe(false);
  });
  it('leaves a thematic break and front-matter fence alone', () => {
    expect(normalizeMarkdown('---\ntitle: x\n---\n\nbody\n')).toBe('---\ntitle: x\n---\n\nbody\n');
    expect(normalizeMarkdown('above\n\n---\n\nbelow\n')).toBe('above\n\n---\n\nbelow\n');
  });
  it('never touches a delimiter row inside a fenced code block', () => {
    const fenced = '```\n|---|---|\n```\n';
    expect(normalizeMarkdown(fenced)).toBe(fenced);
    expect(roundTripEqual(fenced, '```\n| --- | --- |\n```\n')).toBe(false);
  });
});

describe('round-trip: compact tables (#32)', () => {
  it('a compact hand-authored table survives open -> save', async () => {
    const md = '| a | b |\n|---|---|\n| 1 | 2 |\n';
    expect(roundTripEqual(await roundTrip(md), md)).toBe(true);
  });
  it('a compact aligned table survives open -> save', async () => {
    const md = '| left | right |\n|:---|---:|\n| 1 | 2 |\n';
    expect(roundTripEqual(await roundTrip(md), md)).toBe(true);
  });
});
