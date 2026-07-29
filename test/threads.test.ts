import { describe, it, expect } from 'vitest';
import {
  splitThreads,
  serializeThreads,
  withThreads,
  nextThreadId,
  toggleReaction,
  matchAnchor,
  anchorStart,
  anchorEnd,
  type Thread
} from '../src/shared/threads';
import { findCommentRanges } from '../src/webview/plugins/comments';
import { mountEditor, roundTrip } from './helpers/editor';
import { normalizeMarkdown } from '../src/shared/roundtrip';

/**
 * P6 comment threads (docs/design/FORMATS.md). Collaboration lives in the file so it travels in Git:
 * one trailing YAML block plus invisible anchor pairs binding a thread to a *region*. Both
 * must survive the round-trip untouched, and reactions are an emoji → users map, never an
 * array of objects.
 */

const DOC = [
  '# Doc',
  '',
  `The quick ${anchorStart('t1')}brown fox${anchorEnd('t1')} jumps.`,
  '',
  '<!-- omd-threads',
  '- id: t1',
  '  status: open',
  '  comments:',
  '    - author: alice',
  '      body: This needs a citation.',
  '      date: 2026-01-02T10:00:00Z',
  '-->',
  ''
].join('\n');

describe('thread metadata block', () => {
  it('splits the trailing block off the body', () => {
    const { body, threads } = splitThreads(DOC);
    expect(body).not.toContain('omd-threads');
    expect(body).toContain('The quick');
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({ id: 't1', status: 'open' });
    expect(threads[0].comments[0]).toMatchObject({
      author: 'alice',
      body: 'This needs a citation.'
    });
  });

  it('keeps ISO dates as strings even when YAML reads them as timestamps', () => {
    const { threads } = splitThreads(DOC);
    expect(threads[0].comments[0].date).toContain('2026-01-02');
  });

  it('reads reactions as an emoji → users map', () => {
    const md = [
      'Body.',
      '',
      '<!-- omd-threads',
      '- id: t1',
      '  status: open',
      '  comments:',
      '    - author: alice',
      '      body: Nice.',
      '      date: 2026-01-02T10:00:00Z',
      '      reactions:',
      '        👍: [bob, carol]',
      '        🎉: [dave]',
      '-->',
      ''
    ].join('\n');
    const { threads } = splitThreads(md);
    expect(threads[0].comments[0].reactions).toEqual({ '👍': ['bob', 'carol'], '🎉': ['dave'] });
  });

  it('round-trips through split → serialize', () => {
    const { body, threads } = splitThreads(DOC);
    const rebuilt = withThreads(body, threads);
    const again = splitThreads(rebuilt);
    expect(again.threads).toEqual(threads);
    expect(again.body.trim()).toBe(body.trim());
  });

  it('leaves the block in the body rather than losing comments to bad YAML', () => {
    const broken = 'Body.\n\n<!-- omd-threads\n- id: [unclosed\n-->\n';
    const { body, threads } = splitThreads(broken);
    expect(threads).toEqual([]);
    expect(body).toContain('omd-threads'); // never silently discarded
  });

  it('writes nothing when there are no threads', () => {
    expect(serializeThreads([])).toBe('');
    expect(withThreads('Body.\n', [])).toBe('Body.\n');
  });

  it('allocates the next free id', () => {
    const t = (id: string): Thread => ({ id, status: 'open', comments: [] });
    expect(nextThreadId([])).toBe('t1');
    expect(nextThreadId([t('t1'), t('t3')])).toBe('t4');
    expect(nextThreadId([t('custom')])).toBe('t1');
  });
});

describe('reactions', () => {
  const base = { author: 'a', body: 'b', date: 'd' };

  it('adds, then removes, a user without leaving an empty emoji key', () => {
    const added = toggleReaction(base, '👍', 'bob');
    expect(added.reactions).toEqual({ '👍': ['bob'] });
    const removed = toggleReaction(added, '👍', 'bob');
    expect(removed.reactions).toBeUndefined();
  });

  it('keeps other users on the same emoji', () => {
    const two = toggleReaction(toggleReaction(base, '👍', 'bob'), '👍', 'carol');
    expect(two.reactions).toEqual({ '👍': ['bob', 'carol'] });
    expect(toggleReaction(two, '👍', 'bob').reactions).toEqual({ '👍': ['carol'] });
  });
});

describe('anchors', () => {
  it('matches start and end anchors', () => {
    expect(matchAnchor(anchorStart('t1'))).toEqual({ kind: 'start', id: 't1' });
    expect(matchAnchor(anchorEnd('t1'))).toEqual({ kind: 'end', id: 't1' });
    expect(matchAnchor('<!-- omd:date {} -->')).toBeNull();
  });

  it('binds a thread to the region between its anchors', async () => {
    const { handle } = await mountEditor(
      `The quick ${anchorStart('t1')}brown fox${anchorEnd('t1')} jumps.\n`
    );
    const ranges = findCommentRanges(handle.getView().state.doc);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].id).toBe('t1');
    expect(handle.getView().state.doc.textBetween(ranges[0].from, ranges[0].to)).toBe('brown fox');
  });

  it('ignores an unpaired anchor', async () => {
    const { handle } = await mountEditor(`Text ${anchorStart('t9')} more.\n`);
    expect(findCommentRanges(handle.getView().state.doc)).toEqual([]);
  });
});

describe('round-trip', () => {
  const cases: Array<[string, string]> = [
    ['anchors inline', `The quick ${anchorStart('t1')}brown fox${anchorEnd('t1')} jumps.\n`],
    ['document with threads block', DOC]
  ];
  for (const [name, md] of cases) {
    it(`${name} survives byte-for-byte`, async () => {
      expect(normalizeMarkdown(await roundTrip(md))).toBe(normalizeMarkdown(md));
    });
  }

  /**
   * The architectural guarantee: the host strips the metadata, the editor only ever sees the
   * body, and the host re-attaches on write — so an editor round-trip cannot lose comments
   * even though the editor knows nothing about them.
   */
  it('survives the host split → editor round-trip → host re-attach cycle', async () => {
    const { body, threads } = splitThreads(DOC);
    const edited = await roundTrip(body); // what the editor would send back
    const written = withThreads(edited, threads);

    const after = splitThreads(written);
    expect(after.threads).toEqual(threads);
    expect(normalizeMarkdown(written)).toBe(normalizeMarkdown(DOC));
  });

  it('re-attaches metadata even when the editor rewrites the body', async () => {
    const { threads } = splitThreads(DOC);
    const written = withThreads('# Replaced body\n', threads);
    expect(splitThreads(written).threads).toEqual(threads);
    expect(written).toContain('omd-threads');
  });
});
