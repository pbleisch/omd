import { describe, it, expect } from 'vitest';
import {
  parseWikilink,
  formatWikilink,
  mentionLink,
  issueLink,
  isMentionLink,
  isIssueLink,
  parseRepoSlug
} from '../src/shared/references';
import { findWikilinks, setBrokenLinks } from '../src/webview/plugins/references';
import { mountEditor, roundTrip } from './helpers/editor';
import { normalizeMarkdown } from '../src/shared/roundtrip';

/**
 * P6 inline references (docs/design/FORMATS.md). Mentions and issues are always *real links* on disk,
 * so every reader can follow them; wikilinks are the one OMD-specific inline form and must
 * survive the round-trip byte-for-byte while rendering as a link.
 */

describe('wikilinks', () => {
  it('uses the bare form as both label and target', () => {
    expect(parseWikilink('Roadmap')).toEqual({ label: 'Roadmap', target: 'Roadmap' });
  });

  it('reads the label BEFORE the pipe and the target AFTER it', () => {
    // Deliberately the opposite of Obsidian's target-first convention — FORMATS.md fixes this.
    expect(parseWikilink('the plan|Roadmap')).toEqual({ label: 'the plan', target: 'Roadmap' });
  });

  it('trims surrounding whitespace', () => {
    expect(parseWikilink('  the plan | Roadmap ')).toEqual({
      label: 'the plan',
      target: 'Roadmap'
    });
  });

  it('formats back, collapsing when label and target agree', () => {
    expect(formatWikilink('Roadmap', 'Roadmap')).toBe('[[Roadmap]]');
    expect(formatWikilink('the plan', 'Roadmap')).toBe('[[the plan|Roadmap]]');
  });

  it('is found in the document with its label positions', async () => {
    const { handle } = await mountEditor('See [[the plan|Roadmap]] today.\n');
    const hits = findWikilinks(handle.getView().state.doc);
    expect(hits).toHaveLength(1);
    expect(hits[0].target).toBe('Roadmap');
    expect(handle.getView().state.doc.textBetween(hits[0].labelFrom, hits[0].labelTo)).toBe(
      'the plan'
    );
  });

  it('finds several per document', async () => {
    const { handle } = await mountEditor('[[One]] and [[Two|Three]].\n');
    expect(findWikilinks(handle.getView().state.doc).map((h) => h.target)).toEqual([
      'One',
      'Three'
    ]);
  });

  it('ignores a `[[…]]` written inside inline code (it is literal, not a wikilink)', async () => {
    const { handle, root } = await mountEditor('Real [[Home]], literal `[[Home]]`.\n');
    // Only the non-code one is a wikilink.
    expect(findWikilinks(handle.getView().state.doc).map((h) => h.target)).toEqual(['Home']);
    expect(root.querySelectorAll('.omd-wikilink')).toHaveLength(1);
  });
});

describe('link hover tooltips', () => {
  it('a wikilink shows the resolved page file as its title', async () => {
    const { root } = await mountEditor('See [[Smart Blocks]] here.\n');
    const el = root.querySelector('.omd-wikilink') as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.getAttribute('title')).toBe('Smart-Blocks.md'); // spaces → dashes, .md
  });

  it("a labelled wikilink's title follows the target, not the label", async () => {
    const { root } = await mountEditor('See [[the plan|Roadmap]] today.\n');
    const el = root.querySelector('.omd-wikilink') as HTMLElement;
    expect(el.getAttribute('title')).toBe('Roadmap.md');
  });

  it('a regular link shows its href as the title', async () => {
    const { root } = await mountEditor('See [the backlog](BUGS.md) now.\n');
    const el = [...root.querySelectorAll<HTMLElement>('[title]')].find(
      (e) => e.getAttribute('title') === 'BUGS.md'
    );
    expect(el).toBeTruthy();
  });
});

describe('broken references', () => {
  it('marks a link whose target the host reports missing, with a not-found tooltip', async () => {
    const { root, handle } = await mountEditor('See [notes](Missing.md) here.\n');
    // Before the host reports anything, the link is normal (title = href).
    expect(root.querySelector('.omd-link-broken')).toBeNull();
    setBrokenLinks(handle.getView(), ['Missing.md']);
    const el = root.querySelector('.omd-link-broken') as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.getAttribute('title')).toBe('Linked file not found: Missing.md');
    // Clearing the report un-marks it.
    setBrokenLinks(handle.getView(), []);
    expect(root.querySelector('.omd-link-broken')).toBeNull();
  });

  it('marks an empty-target link with an amber warning (no host report needed)', async () => {
    const { root } = await mountEditor('An [empty]() link.\n');
    const el = root.querySelector('.omd-link-warning') as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.getAttribute('title')).toBe('Link has no target.');
  });

  it('marks an anchor link that matches no heading, but not one that does', async () => {
    const { root } = await mountEditor(
      'Jump to [nowhere](#nope) and [here](#real-heading).\n\n## Real Heading\n'
    );
    const warnings = [...root.querySelectorAll<HTMLElement>('.omd-link-warning')];
    expect(warnings).toHaveLength(1);
    expect(warnings[0].getAttribute('title')).toBe('No heading matches "#nope".');
  });

  it('marks an image that fails to load as broken, with a not-found tooltip', async () => {
    const { root } = await mountEditor('![missing](does-not-exist.png)\n');
    const img = root.querySelector('.omd-img img') as HTMLImageElement;
    expect(img).toBeTruthy();
    img.dispatchEvent(new Event('error')); // jsdom doesn't load images; simulate the failure
    expect(img.closest('.omd-img--broken')).toBeTruthy();
    expect(img.getAttribute('title')).toBe('Image not found: does-not-exist.png');
    // A clean placeholder (icon + the alt text) replaces the browser's broken glyph.
    const box = root.querySelector('.omd-img-broken-box') as HTMLElement;
    expect(box).toBeTruthy();
    expect(box.querySelector('.codicon')).toBeTruthy();
    expect(box.querySelector('.omd-img-broken-label')?.textContent).toBe('missing'); // the alt
    // A later successful load clears it.
    img.dispatchEvent(new Event('load'));
    expect(img.closest('.omd-img--broken')).toBeNull();
    expect(img.getAttribute('title')).toBeNull();
  });
});

describe('mentions and issues are real links', () => {
  it('builds a mention link', () => {
    expect(mentionLink('alice')).toBe('[@alice](https://github.com/alice)');
    expect(mentionLink('@alice')).toBe('[@alice](https://github.com/alice)');
  });

  it('builds an issue link from the repo slug', () => {
    expect(issueLink(123, 'acme', 'omd')).toBe(
      '[#123](https://github.com/acme/omd/issues/123)'
    );
    expect(issueLink('#7', 'acme', 'omd')).toContain('/issues/7');
  });

  it('recognizes them for chip styling, and rejects look-alikes', () => {
    expect(isMentionLink('@alice', 'https://github.com/alice')).toBe(true);
    expect(isMentionLink('alice', 'https://github.com/alice')).toBe(false);
    expect(isMentionLink('@alice', 'https://example.com/alice')).toBe(false);

    expect(isIssueLink('#123', 'https://github.com/acme/omd/issues/123')).toBe(true);
    expect(isIssueLink('#124', 'https://github.com/acme/omd/issues/123')).toBe(false);
    expect(isIssueLink('#123', 'https://github.com/acme/omd/pull/123')).toBe(false);
  });

  it('parses a repo slug, tolerating a .git suffix', () => {
    expect(parseRepoSlug('acme/omd')).toEqual({ owner: 'acme', repo: 'omd' });
    expect(parseRepoSlug('acme/omd.git')).toEqual({ owner: 'acme', repo: 'omd' });
    expect(parseRepoSlug('nope')).toBeNull();
  });
});

describe('reference round-trip', () => {
  const cases: Array<[string, string]> = [
    ['bare wikilink', 'See [[Roadmap]] for details.\n'],
    ['labelled wikilink', 'See [[the plan|Roadmap]] for details.\n'],
    ['two wikilinks', '[[One]] and [[Two|Three]].\n'],
    ['mention', 'Ping [@alice](https://github.com/alice) about it.\n'],
    ['issue', 'Fixes [#123](https://github.com/acme/omd/issues/123).\n'],
    [
      'all three together',
      'Ping [@alice](https://github.com/alice) about [#12](https://github.com/acme/omd/issues/12) in [[Roadmap]].\n'
    ]
  ];
  for (const [name, md] of cases) {
    it(`${name} survives byte-for-byte`, async () => {
      expect(normalizeMarkdown(await roundTrip(md))).toBe(normalizeMarkdown(md));
    });
  }
});
