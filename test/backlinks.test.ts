import { describe, it, expect } from 'vitest';
import {
  collectWikilinks,
  targetMatchesPage,
  pageSlug,
  wikiTargetCandidates
} from '../src/shared/references';

/**
 * P6 backlinks. The filesystem scan is host glue, but the two rules that decide *what counts
 * as a backlink* live here so they stay testable: which wikilinks a page contains, and whether
 * a target refers to a given page. Targets are written loosely in practice, so matching has to
 * be forgiving without becoming wrong.
 */

describe('collecting wikilinks from a page', () => {
  it('finds every link with its label and target', () => {
    const text = 'See [[Roadmap]] and [[the plan|Architecture]].\n\nAlso [[Notes]].';
    expect(collectWikilinks(text)).toEqual([
      { label: 'Roadmap', target: 'Roadmap' },
      { label: 'the plan', target: 'Architecture' },
      { label: 'Notes', target: 'Notes' }
    ]);
  });

  it('returns nothing for a page with no wikilinks', () => {
    expect(collectWikilinks('Plain text with [a link](http://x) and [brackets].')).toEqual([]);
  });

  it('is re-runnable (the shared global regex is reset each call)', () => {
    const text = '[[One]] [[Two]]';
    expect(collectWikilinks(text)).toHaveLength(2);
    expect(collectWikilinks(text)).toHaveLength(2); // would be 0 if lastIndex leaked
  });
});

describe('matching a target to a page', () => {
  it('matches the plain name', () => {
    expect(targetMatchesPage('Roadmap', 'Roadmap')).toBe(true);
    expect(targetMatchesPage('Roadmap', 'Other')).toBe(false);
  });

  it('ignores case, a .md suffix, and any folder prefix', () => {
    expect(targetMatchesPage('roadmap', 'Roadmap')).toBe(true);
    expect(targetMatchesPage('Roadmap.md', 'Roadmap')).toBe(true);
    expect(targetMatchesPage('docs/Roadmap.md', 'Roadmap')).toBe(true);
    expect(targetMatchesPage('Roadmap', 'docs/Roadmap.md')).toBe(true);
  });

  it('does not match a different page that merely shares a prefix', () => {
    expect(targetMatchesPage('Roadmap-2026', 'Roadmap')).toBe(false);
    expect(targetMatchesPage('docs/Notes.md', 'Roadmap')).toBe(false);
  });

  it('tolerates surrounding whitespace', () => {
    expect(targetMatchesPage('  Roadmap  ', 'Roadmap')).toBe(true);
  });

  it('treats spaces and dashes as equivalent (GitHub wiki convention)', () => {
    // "Getting Started" is stored as Getting-Started.md; all these forms link to it.
    expect(targetMatchesPage('Getting Started', 'Getting-Started')).toBe(true);
    expect(targetMatchesPage('Getting-Started', 'Getting-Started')).toBe(true);
    expect(targetMatchesPage('getting started', 'Getting-Started.md')).toBe(true);
    expect(targetMatchesPage('Getting Started.md', 'Getting-Started')).toBe(true);
    // still discriminating — a genuinely different page doesn't match.
    expect(targetMatchesPage('Getting Started Guide', 'Getting-Started')).toBe(false);
  });
});

describe('page slug + wikilink resolution candidates', () => {
  it('pageSlug strips folder/.md, lower-cases, and folds spaces to dashes', () => {
    expect(pageSlug('docs/Getting Started.md')).toBe('getting-started');
    expect(pageSlug('API Reference')).toBe('api-reference');
    expect(pageSlug('Home')).toBe('home');
  });

  it('wikiTargetCandidates offers the literal name then its dashed form, deduped', () => {
    expect(wikiTargetCandidates('Getting Started')).toEqual(['Getting Started', 'Getting-Started']);
    expect(wikiTargetCandidates('Getting-Started')).toEqual(['Getting-Started']); // no dupe
    expect(wikiTargetCandidates('Home.md')).toEqual(['Home']);
    expect(wikiTargetCandidates('docs/API Reference')).toEqual(['docs/API Reference', 'docs/API-Reference']);
  });
});

describe('what a page-scan would find', () => {
  // The host reads each file and applies exactly these two rules.
  const pages: Record<string, string> = {
    'docs/Planning.md': 'Tracked in [[Roadmap]] this quarter.',
    'docs/Design.md': 'See [[the plan|roadmap.md]] for scope.',
    'docs/Unrelated.md': 'Nothing to see, just [[Notes]].',
    'Roadmap.md': 'Self reference [[Roadmap]] should be excluded by the host.'
  };

  it('identifies the pages linking to Roadmap', () => {
    const linking = Object.entries(pages)
      .filter(([path]) => path !== 'Roadmap.md') // the host skips the document itself
      .filter(([, text]) => collectWikilinks(text).some((l) => targetMatchesPage(l.target, 'Roadmap')))
      .map(([path]) => path);
    expect(linking).toEqual(['docs/Planning.md', 'docs/Design.md']);
  });

  it('keeps the label the author used as the context', () => {
    const link = collectWikilinks(pages['docs/Design.md']).find((l) =>
      targetMatchesPage(l.target, 'Roadmap')
    );
    expect(link?.label).toBe('the plan');
  });
});
