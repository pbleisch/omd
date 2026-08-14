import { describe, it, expect } from 'vitest';
import {
  diagnose,
  slugify,
  headingSlugs,
  fileLinkTargets
} from '../src/shared/diagnostics';

/**
 * P7 diagnostics. The rules are pure functions of the text; the host maps offsets to ranges
 * and adds the filesystem check. The bar is *no false positives* — a noisy Problems panel is
 * worse than a quiet one — so these tests pin what does and does not flag.
 */

const codes = (md: string) => diagnose(md).map((d) => d.code);

describe('heading slugs', () => {
  it('slugifies GitHub-style', () => {
    expect(slugify('Hello, World!')).toBe('hello-world');
    expect(slugify('  Spaced  Out  ')).toBe('spaced-out');
    expect(slugify('Café details')).toBe('café-details'); // keeps letters/digits
  });

  it('de-duplicates repeated headings', () => {
    const slugs = headingSlugs('# Intro\n\n## Intro\n\n## Intro\n').map((h) => h.slug);
    expect(slugs).toEqual(['intro', 'intro-1', 'intro-2']);
  });

  it('ignores headings inside code fences', () => {
    expect(headingSlugs('# Real\n\n```\n# Fake\n```\n').map((h) => h.slug)).toEqual(['real']);
  });
});

describe('anchor links', () => {
  it('accepts an anchor that matches a heading', () => {
    expect(codes('# Setup\n\nSee [setup](#setup).\n')).toEqual([]);
  });

  it('flags an anchor with no matching heading and suggests the nearest', () => {
    const [d] = diagnose('# Setup\n\nSee [setup](#steup).\n');
    expect(d.code).toBe('bad-anchor');
    expect(d.message).toContain('#setup');
    expect(d.fix?.text).toBe('#setup');
  });

  it('flags a wild anchor but offers no fix when nothing is close', () => {
    const [d] = diagnose('# Setup\n\nSee [x](#completely-different-thing).\n');
    expect(d.code).toBe('bad-anchor');
    expect(d.fix).toBeUndefined();
  });
});

describe('empty and broken structure', () => {
  it('flags a link with no target', () => {
    expect(codes('A [dangling]() link.\n')).toContain('empty-link');
  });

  it('flags an unclosed HTML comment', () => {
    expect(codes('text <!-- open but never closed\n')).toContain('unclosed-html');
    expect(codes('text <!-- closed --> ok\n')).not.toContain('unclosed-html');
  });

  it('flags unbalanced block tags', () => {
    expect(codes('<details>\n<summary>x</summary>\n\nbody\n')).toContain('unbalanced-html');
    expect(codes('<details>\n\nbody\n\n</details>\n')).not.toContain('unbalanced-html');
    expect(codes('</table>\n')).toContain('unbalanced-html');
  });

  it('does not flag a tag or comment shown in inline code (documentation, not markup)', () => {
    expect(codes('Write `<details>` or `<table>` to make a block.\n')).not.toContain('unbalanced-html');
    expect(codes('An unterminated `<!--` comment marker.\n')).not.toContain('unclosed-html');
    // …but a real unclosed tag outside code is still flagged.
    expect(codes('`<table>` is inline, but <details>\n\nreal open\n')).toContain('unbalanced-html');
  });

  it('flags malformed front matter', () => {
    expect(codes('---\nkey: [unclosed\n---\n\nBody.\n')).toContain('frontmatter');
    expect(codes('---\ntitle: OK\n---\n\nBody.\n')).not.toContain('frontmatter');
  });
});

describe('false-positive guards', () => {
  it('does not flag a clean document', () => {
    const md = [
      '---',
      'title: Clean',
      '---',
      '',
      '# Intro',
      '',
      'See [intro](#intro) and [external](https://example.com).',
      '',
      '```html',
      '<details>unclosed in code is fine</details is not real',
      '```',
      ''
    ].join('\n');
    expect(diagnose(md)).toEqual([]);
  });

  it('ignores a comment or tag inside a code fence', () => {
    expect(codes('```\n<!-- not closed here\n<details>\n```\n')).toEqual([]);
  });
});

describe('file link extraction (for the host fs check)', () => {
  it('collects relative links and skips urls, anchors, and mail', () => {
    const md =
      'See [a](./other.md), [b](sub/page.md#top), [c](https://x.com), [d](#anchor), [e](mailto:x@y.z).\n';
    expect(fileLinkTargets(md).map((l) => l.target)).toEqual(['./other.md', 'sub/page.md']);
  });

  it('keeps a pointy-bracket destination with spaces together', () => {
    expect(fileLinkTargets('See [the notes](<my doc.md>).\n').map((l) => l.target)).toEqual([
      'my doc.md'
    ]);
  });

  it('ignores links inside code fences', () => {
    expect(fileLinkTargets('```\n[x](./nope.md)\n```\n')).toEqual([]);
  });

  it('ignores a link/image example written inside inline code', () => {
    // The Media.md false positive: `![](…)` in prose is an example, not a real image.
    expect(fileLinkTargets('A bare `![](…)` stays plain markdown.\n')).toEqual([]);
    expect(fileLinkTargets('Write `[x](nope.md)` to link.\n')).toEqual([]);
    // A real link on the same line is still collected.
    expect(fileLinkTargets('Real [a](./a.md), example `[b](./b.md)`.\n').map((l) => l.target)).toEqual([
      './a.md'
    ]);
  });
});
