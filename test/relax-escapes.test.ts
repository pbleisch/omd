import { describe, it, expect } from 'vitest';
import { relaxEscapes } from '../src/webview/plugins/relax-escapes';
import { roundTrip } from './helpers/editor';
import { roundTripEqual } from '../src/shared/roundtrip';

/**
 * `relaxEscapes` removes the escapes remark added that the document can prove it does not
 * need (#37). Every case below comes in both halves: the escape it *does* remove, and the
 * neighbouring shape where removing it would change what the file means. The second half
 * is the point — a pass that only unescapes is a corruption engine.
 */

describe('relax escapes: tildes', () => {
  it('drops the escape on a tilde that cannot open strikethrough', () => {
    expect(relaxEscapes('after \\~1500 ms.\n')).toBe('after ~1500 ms.\n');
    expect(relaxEscapes('from \\~59 MB to \\~4.3 MB.\n')).toBe('from ~59 MB to ~4.3 MB.\n');
    expect(relaxEscapes('(\\~430 ms versus \\~610 ms)\n')).toBe('(~430 ms versus ~610 ms)\n');
  });

  it('keeps the escape when the tildes could pair into strikethrough', () => {
    // `~a~` is strikethrough on GitHub: the first run can open, the second can close.
    expect(relaxEscapes('a \\~b\\~ c\n')).toBe('a \\~b\\~ c\n');
    expect(relaxEscapes('a \\~\\~b\\~\\~ c\n')).toBe('a \\~\\~b\\~\\~ c\n');
    // Across an inline code span, which strikethrough spans happily.
    expect(relaxEscapes('a \\~b `c` d\\~ e\n')).toBe('a \\~b `c` d\\~ e\n');
  });

  it('keeps the escape when a real strikethrough is already in the container', () => {
    expect(relaxEscapes('~~gone~~ and \\~500 ms\n')).toBe('~~gone~~ and \\~500 ms\n');
  });

  it('keeps a line-initial escape, which would become a code fence', () => {
    expect(relaxEscapes('text\n\\~\\~\\~\nmore\n')).toBe('text\n\\~\\~\\~\nmore\n');
  });

  it('decides per table cell, because GFM splits cells before parsing inlines', () => {
    expect(relaxEscapes('| \\~2.5 MB | \\~a\\~ |\n')).toBe('| ~2.5 MB | \\~a\\~ |\n');
  });
});

describe('relax escapes: backticks', () => {
  it('drops the escape on a backtick run that cannot pair', () => {
    expect(relaxEscapes('a \\`\\`\\`mermaid fence here\n')).toBe('a ```mermaid fence here\n');
  });

  it('keeps the escape when a run of the same width follows', () => {
    expect(relaxEscapes('a \\`\\`\\`x\\`\\`\\` b\n')).toBe('a \\`\\`\\`x\\`\\`\\` b\n');
  });

  it('keeps the escape when an existing code span uses that width', () => {
    // Unescaping would steal the span's opening delimiter.
    expect(relaxEscapes('a \\` and `code` here\n')).toBe('a \\` and `code` here\n');
  });

  it('keeps a line-initial escape, which would become a code fence', () => {
    expect(relaxEscapes('text\n\\`\\`\\`\nmore\n')).toBe('text\n\\`\\`\\`\nmore\n');
  });
});

describe('relax escapes: brackets', () => {
  it('drops the escape when no link, image, or reference can form', () => {
    expect(relaxEscapes('## \\[Unreleased]\n')).toBe('## [Unreleased]\n');
    expect(relaxEscapes('| `keywords` | string\\[] | no |\n')).toBe(
      '| `keywords` | string[] | no |\n'
    );
  });

  it('keeps the escape when the container could form a link', () => {
    expect(relaxEscapes('see \\[a] and [b](c)\n')).toBe('see \\[a] and [b](c)\n');
    expect(relaxEscapes('see \\[a] and [b][c]\n')).toBe('see \\[a] and [b][c]\n');
  });

  it('keeps the escape when the document defines that exact link label', () => {
    expect(relaxEscapes('## \\[Unreleased]\n\n[Unreleased]: https://example.com\n')).toBe(
      '## \\[Unreleased]\n\n[Unreleased]: https://example.com\n'
    );
    // Label matching is case-folded and collapses whitespace, so both spellings still match.
    expect(relaxEscapes('see \\[UN Released]\n\n[un   released]: https://example.com\n')).toBe(
      'see \\[UN Released]\n\n[un   released]: https://example.com\n'
    );
  });

  it('drops the escape on a bracket whose label the document does not define (#33)', () => {
    // Before reference links survived a load, no loaded document ever *kept* a definition, so
    // "the document defines something" was free to treat as "no bracket here is relaxable".
    // Now that they survive, that would put a backslash before every literal `[word]` in a
    // file that happens to carry a definitions block.
    expect(relaxEscapes('a literal \\[word] here\n\n[other]: https://example.com\n')).toBe(
      'a literal [word] here\n\n[other]: https://example.com\n'
    );
    // The defined one still keeps its escape, in the same container as a relaxed one.
    expect(relaxEscapes('\\[word] and \\[other]\n\n[other]: https://example.com\n')).toBe(
      '[word] and \\[other]\n\n[other]: https://example.com\n'
    );
  });

  it('keeps the escape on a footnote reference and a wikilink', () => {
    expect(relaxEscapes('see \\[^1] here\n')).toBe('see \\[^1] here\n');
    expect(relaxEscapes('see \\[\\[Roadmap]] here\n')).toBe('see \\[\\[Roadmap]] here\n');
  });

  it('keeps a line-initial escape, which would become a definition or a checkbox', () => {
    expect(relaxEscapes('text\n\\[foo]: not a definition\n')).toBe(
      'text\n\\[foo]: not a definition\n'
    );
    expect(relaxEscapes('- \\[x] not a checkbox\n')).toBe('- \\[x] not a checkbox\n');
  });
});

/**
 * GFM example 337. `](` alone is not enough to make a link: what follows it has to be a real
 * destination-title-`)` tail. When it is not, neither the `[` nor the `(` needs its backslash —
 * which is the whole of why the "Entity and numeric character references" round-trip baseline is
 * back at 9 (`test/gfm-conformance.test.ts`).
 */
describe('relax escapes: a `](` that cannot close a link', () => {
  it('drops both escapes when the tail is not a link tail', () => {
    // `&quot;` is an entity, not the `"` that opens a title, so the destination is followed by
    // junk rather than by a title and a `)`.
    expect(relaxEscapes('\\[a]\\(url &quot;tit&quot;)\n')).toBe('[a](url &quot;tit&quot;)\n');
    // An unterminated title, and a destination whose parentheses do not balance.
    expect(relaxEscapes('see \\[a]\\(url "tit) here\n')).toBe('see [a](url "tit) here\n');
    expect(relaxEscapes('see \\[a]\\(u(rl) here\n')).toBe('see [a](u(rl) here\n');
  });

  it('keeps both escapes when the tail IS a link tail', () => {
    expect(relaxEscapes('\\[a]\\(url "tit")\n')).toBe('\\[a]\\(url "tit")\n');
    expect(relaxEscapes('\\[a]\\(url)\n')).toBe('\\[a]\\(url)\n');
    expect(relaxEscapes('\\[a]\\()\n')).toBe('\\[a]\\()\n');
    expect(relaxEscapes('\\[a]\\(<u rl> \'tit\')\n')).toBe('\\[a]\\(<u rl> \'tit\')\n');
    // A valid tail anywhere in the container keeps every escape in it, because unescaping a
    // `[` can change which opener a later `]` binds to.
    expect(relaxEscapes('\\[a] and \\[b]\\(c)\n')).toBe('\\[a] and \\[b]\\(c)\n');
  });

  it('leaves a `(` that remark did not escape for link reasons', () => {
    // Not after a `]`, so the backslash is the writer's, not the serializer's.
    expect(relaxEscapes('a literal \\(paren) here\n')).toBe('a literal \\(paren) here\n');
  });
});

describe('relax escapes: code is never touched', () => {
  it('leaves a backslash inside a fenced block alone', () => {
    const fenced = '```\na \\~b and \\[c] and \\`d\n```\n';
    expect(relaxEscapes(fenced)).toBe(fenced);
  });

  it('leaves a backslash inside an inline code span alone', () => {
    expect(relaxEscapes('see `a \\[b] c` here\n')).toBe('see `a \\[b] c` here\n');
  });
});

describe('relax escapes: through the real editor', () => {
  const cases = [
    'A build takes ~430 ms versus ~610 ms.\n',
    '## [Unreleased]\n\nSomething changed.\n',
    '| Field | Type |\n| --- | --- |\n| `keywords` | string[] |\n',
    'mermaid loads for a ```mermaid fence.\n',
    // The shapes the escape is *for*: these must survive unchanged.
    'A ~~struck~~ word.\n',
    'A [link](https://example.com) and an ![image](x.png).\n',
    'Text with `code` in it.\n'
  ];
  for (const md of cases) {
    it(JSON.stringify(md), async () => {
      // `roundTripEqual`, not `toBe`: remark pads table cells for visual alignment, which
      // the comparison already treats as equal (#32).
      expect(roundTripEqual(await roundTrip(md), md)).toBe(true);
    });
  }

  it('survives a second generation (the escape does not come back)', async () => {
    const md = 'A build takes ~430 ms.\n';
    expect(await roundTrip(await roundTrip(md))).toBe(md);
  });
});
