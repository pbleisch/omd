import { describe, it, expect, beforeEach } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import {
  createThread,
  addComment,
  setThreadStatus,
  removeThread,
  reactToComment,
  splitThreads,
  withThreads,
  type Thread
} from '../src/shared/threads';
import { setThreads, getThreads } from '../src/webview/blocks/threads-registry';
import { setAuthor, currentUser } from '../src/webview/blocks/identity';
import {
  wrapSelectionWithAnchors,
  startThread,
  deleteThread,
  makeComment
} from '../src/webview/blocks/thread-actions';
import { findCommentRanges } from '../src/webview/plugins/comments';
import { mountEditor, roundTrip } from './helpers/editor';
import { normalizeMarkdown } from '../src/shared/roundtrip';

/**
 * P6 thread actions. The document half (the anchor pair) is an ordinary editor edit; the
 * metadata half is pure data the host writes. These tests cover both halves and, crucially,
 * that a thread created in the editor still round-trips.
 */

const comment = (body: string) => ({ author: 'alice', body, date: '2026-01-02T10:00:00Z' });

describe('thread mutations are pure', () => {
  const base: Thread[] = [{ id: 't1', status: 'open', comments: [comment('First')] }];

  it('creates without mutating the input', () => {
    const next = createThread(base, 't2', comment('New'));
    expect(next).toHaveLength(2);
    expect(base).toHaveLength(1);
    expect(next[1]).toMatchObject({ id: 't2', status: 'open' });
  });

  it('appends a reply to the right thread only', () => {
    const two = createThread(base, 't2', comment('Other'));
    const next = addComment(two, 't1', comment('Reply'));
    expect(next[0].comments.map((c) => c.body)).toEqual(['First', 'Reply']);
    expect(next[1].comments).toHaveLength(1);
  });

  it('resolves and reopens', () => {
    expect(setThreadStatus(base, 't1', 'resolved')[0].status).toBe('resolved');
    expect(setThreadStatus(setThreadStatus(base, 't1', 'resolved'), 't1', 'open')[0].status).toBe(
      'open'
    );
  });

  it('removes a thread', () => {
    expect(removeThread(base, 't1')).toEqual([]);
    expect(removeThread(base, 'nope')).toHaveLength(1);
  });

  it('toggles a reaction on one comment', () => {
    const on = reactToComment(base, 't1', 0, '👍', 'bob');
    expect(on[0].comments[0].reactions).toEqual({ '👍': ['bob'] });
    const off = reactToComment(on, 't1', 0, '👍', 'bob');
    expect(off[0].comments[0].reactions).toBeUndefined();
  });
});

describe('comment author identity', () => {
  it('defaults to a placeholder and takes the host-resolved name', () => {
    expect(makeComment('hi').author).toBe('you');
    setAuthor('Paul Bleisch');
    expect(currentUser()).toBe('Paul Bleisch');
    expect(makeComment('hi').author).toBe('Paul Bleisch');
    setAuthor('you'); // restore for the other suites
  });

  it('ignores an empty name rather than blanking the author', () => {
    setAuthor('alice');
    setAuthor('');
    expect(currentUser()).toBe('alice');
    setAuthor('you');
  });
});

describe('anchoring a thread to a selection', () => {
  beforeEach(() => setThreads([]));

  it('wraps the selection so the region is recoverable', async () => {
    const { handle } = await mountEditor('The quick brown fox jumps.\n');
    const view = handle.getView();
    // Select "brown fox".
    const text = view.state.doc.textContent;
    const from = text.indexOf('brown fox') + 1;
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, from, from + 'brown fox'.length))
    );

    expect(wrapSelectionWithAnchors(view, 't1')).toBe(true);
    const ranges = findCommentRanges(view.state.doc);
    expect(ranges).toHaveLength(1);
    expect(view.state.doc.textBetween(ranges[0].from, ranges[0].to)).toBe('brown fox');
  });

  it('refuses to anchor an empty selection', async () => {
    const { handle } = await mountEditor('Text.\n');
    const view = handle.getView();
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2, 2)));
    expect(wrapSelectionWithAnchors(view, 't1')).toBe(false);
  });

  it('a thread started in the editor round-trips, metadata included', async () => {
    const { handle } = await mountEditor('The quick brown fox jumps.\n');
    const view = handle.getView();
    const from = view.state.doc.textContent.indexOf('brown fox') + 1;
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, from, from + 9))
    );

    const id = startThread(view, 'Needs a citation.');
    expect(id).toBe('t1');
    expect(getThreads()).toHaveLength(1);

    // What the host would write: the edited body plus the metadata block.
    const written = withThreads(handle.getMarkdown(), getThreads());
    expect(written).toContain('<!-- omd-start:t1 -->');
    expect(written).toContain('omd-threads');

    const reopened = splitThreads(written);
    expect(reopened.threads[0].comments[0].body).toBe('Needs a citation.');
    expect(normalizeMarkdown(await roundTrip(reopened.body))).toBe(
      normalizeMarkdown(reopened.body)
    );
  });

  it('deleting a thread strips its anchors from the document', async () => {
    const { handle } = await mountEditor('The quick brown fox jumps.\n');
    const view = handle.getView();
    const from = view.state.doc.textContent.indexOf('brown fox') + 1;
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, from, from + 9))
    );
    startThread(view, 'Note');
    expect(findCommentRanges(view.state.doc)).toHaveLength(1);

    deleteThread(view, 't1');
    expect(findCommentRanges(view.state.doc)).toEqual([]);
    expect(getThreads()).toEqual([]);
    expect(handle.getMarkdown()).not.toContain('omd-start');
  });
});
