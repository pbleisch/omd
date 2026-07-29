import { describe, it, expect } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { mountEditor } from './helpers/editor';
import { setModels } from '../src/webview/blocks/models-registry';
import { canRevise } from '../src/webview/blocks/revise';
import {
  beginRevise,
  pushReviseChunk,
  finishRevise,
  failRevise,
  acceptRevise,
  rejectRevise,
  getReviseState
} from '../src/webview/plugins/revise/plugin';

/**
 * Inline AI revision (plugins/revise): a decoration-only diff over a selection. The document is
 * never touched until Accept, so Reject leaves it byte-identical. These cover the state machine and
 * the mark-preserving apply directly (the live model path is host-mediated, like test/ai.test.ts).
 */

/** Positions of `word` in a single-paragraph document (paragraph content starts at pos 1). */
function wordRange(text: string, word: string): { from: number; to: number } {
  const i = text.indexOf(word);
  return { from: 1 + i, to: 1 + i + word.length };
}

describe('revise diff decorations', () => {
  it('strikes the selection and shows the streamed rewrite with controls', async () => {
    const { root, handle } = await mountEditor('The quick brown fox.\n');
    const view = handle.getView();
    const { from, to } = wordRange('The quick brown fox.', 'quick');

    beginRevise(view, from, to, 'n1');
    expect(root.querySelector('.omd-revise-old')).toBeTruthy();
    expect(root.querySelector('.omd-revise-widget')).toBeTruthy();

    pushReviseChunk(view, 'n1', 'swift');
    expect(root.querySelector('.omd-revise-new')?.textContent).toContain('swift');
    // Streaming shows a Stop control, not Accept yet.
    expect(root.querySelector('.omd-revise-btn[title="Stop"]')).toBeTruthy();
    expect(root.querySelector('.omd-revise-btn[title="Accept"]')).toBeNull();

    finishRevise(view, 'n1', 'swift');
    expect(root.querySelector('.omd-revise-btn[title="Accept"]')).toBeTruthy();
    expect(root.querySelector('.omd-revise-btn[title="Reject"]')).toBeTruthy();
  });

  it('ignores chunks from a superseded nonce', async () => {
    const { handle } = await mountEditor('The quick brown fox.\n');
    const view = handle.getView();
    const { from, to } = wordRange('The quick brown fox.', 'quick');
    beginRevise(view, from, to, 'n1');
    pushReviseChunk(view, 'stale', 'nope');
    expect(getReviseState(view)?.text).toBe('');
  });
});

describe('revise apply', () => {
  it('accepts a single-paragraph rewrite in place, preserving inline marks', async () => {
    const { handle } = await mountEditor('The quick brown fox.\n');
    const view = handle.getView();
    const { from, to } = wordRange('The quick brown fox.', 'quick');

    beginRevise(view, from, to, 'n1');
    finishRevise(view, 'n1', '**swift**');
    acceptRevise(view);

    expect(getReviseState(view)).toBeNull();
    const out = handle.getMarkdown();
    expect(out).toBe('The **swift** brown fox.\n');
  });

  it('applies a multi-block result without throwing', async () => {
    const { handle } = await mountEditor('Replace me.\n');
    const view = handle.getView();
    const { from, to } = wordRange('Replace me.', 'Replace me.');

    beginRevise(view, from, to, 'n1');
    finishRevise(view, 'n1', '- one\n- two\n');
    acceptRevise(view);

    const out = handle.getMarkdown();
    expect(out).toContain('- one');
    expect(out).toContain('- two');
  });

  it('does not accept while still streaming', async () => {
    const { handle } = await mountEditor('The quick brown fox.\n');
    const view = handle.getView();
    const { from, to } = wordRange('The quick brown fox.', 'quick');
    beginRevise(view, from, to, 'n1');
    pushReviseChunk(view, 'n1', 'swift');
    acceptRevise(view); // phase is 'streaming' → ignored
    expect(getReviseState(view)).not.toBeNull();
    expect(handle.getMarkdown()).toBe('The quick brown fox.\n');
  });
});

describe('revise reject / clear', () => {
  it('leaves the document byte-identical on reject', async () => {
    const src = 'The quick brown fox.\n';
    const { root, handle } = await mountEditor(src);
    const view = handle.getView();
    const { from, to } = wordRange(src, 'quick');

    beginRevise(view, from, to, 'n1');
    finishRevise(view, 'n1', '**swift**');
    rejectRevise(view);

    expect(getReviseState(view)).toBeNull();
    expect(root.querySelector('.omd-revise-old')).toBeNull();
    expect(handle.getMarkdown()).toBe(src);
  });

  it('shows an error and dismisses cleanly', async () => {
    const { root, handle } = await mountEditor('The quick brown fox.\n');
    const view = handle.getView();
    const { from, to } = wordRange('The quick brown fox.', 'quick');
    beginRevise(view, from, to, 'n1');
    failRevise(view, 'n1', 'AI is off.');
    expect(root.querySelector('.omd-revise-error')?.textContent).toBe('AI is off.');
    rejectRevise(view);
    expect(getReviseState(view)).toBeNull();
  });
});

describe('revise position mapping', () => {
  it('tracks the range through an edit before it', async () => {
    const { handle } = await mountEditor('The quick brown fox.\n');
    const view = handle.getView();
    const { from, to } = wordRange('The quick brown fox.', 'quick');
    beginRevise(view, from, to, 'n1');

    // Insert two chars at the very start of the paragraph; the pending range shifts by 2.
    view.dispatch(view.state.tr.insertText('XX', 1, 1));
    const s = getReviseState(view);
    expect(s?.from).toBe(from + 2);
    expect(s?.to).toBe(to + 2);
  });
});

describe('canRevise gating', () => {
  it('is false when AI is off, true for a non-empty selection when on', async () => {
    const { handle } = await mountEditor('The quick brown fox.\n');
    const view = handle.getView();
    const { from, to } = wordRange('The quick brown fox.', 'quick');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));

    setModels([], false);
    expect(canRevise(view)).toBe(false);
    setModels([], true);
    expect(canRevise(view)).toBe(true);

    // Collapsed selection is never revisable.
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, from)));
    expect(canRevise(view)).toBe(false);
  });
});
