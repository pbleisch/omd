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

  it('keeps the escape when the document defines a link label anywhere', () => {
    expect(relaxEscapes('## \\[Unreleased]\n\n[Unreleased]: https://example.com\n')).toBe(
      '## \\[Unreleased]\n\n[Unreleased]: https://example.com\n'
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
