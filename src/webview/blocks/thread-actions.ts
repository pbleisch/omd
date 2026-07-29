import type { EditorView } from 'prosemirror-view';
import { TextSelection } from 'prosemirror-state';
import {
  anchorStart,
  anchorEnd,
  nextThreadId,
  createThread,
  addComment,
  setThreadStatus,
  removeThread,
  reactToComment,
  type Thread,
  type ThreadComment
} from '../../shared/threads';
import { getThreads, setThreads } from './threads-registry';
import { currentUser } from './identity';
import { findCommentRanges } from '../plugins/comments';
import { post } from '../vscode';

/**
 * Comment actions. The document half (the anchor pair) is an ordinary editor edit; the
 * metadata half is *intent* sent to the host, which owns the thread block and is the only
 * writer to disk (docs/design/ARCHITECTURE.md). Keeping the two halves separate is what lets the
 * editor stay ignorant of the metadata format.
 *
 * The comment author comes from the host's resolved identity (see blocks/identity).
 */
function nowIso(): string {
  return new Date().toISOString();
}

export function makeComment(body: string, author = currentUser()): ThreadComment {
  return { author, body, date: nowIso() };
}

/** Push the new thread list to both the local registry and the host. */
function commit(threads: Thread[]): void {
  setThreads(threads);
  post({ type: 'updateThreads', threads });
}

/** Wrap the current selection in an anchor pair keyed to `id`. */
export function wrapSelectionWithAnchors(view: EditorView, id: string): boolean {
  const { from, to } = view.state.selection;
  if (from === to) return false;
  const html = view.state.schema.nodes.html;
  if (!html) return false;

  // Insert the closing anchor first so `from` stays valid for the opening one.
  let tr = view.state.tr;
  tr = tr.insert(to, html.create({ value: anchorEnd(id) }));
  tr = tr.insert(from, html.create({ value: anchorStart(id) }));
  view.dispatch(tr);
  return true;
}

/** Start a thread on the current selection. Returns the new thread id, or null. */
export function startThread(view: EditorView, body: string): string | null {
  const id = nextThreadId(getThreads());
  if (!wrapSelectionWithAnchors(view, id)) return null;
  commit(createThread(getThreads(), id, makeComment(body)));
  view.focus();
  return id;
}

export function replyToThread(id: string, body: string): void {
  commit(addComment(getThreads(), id, makeComment(body)));
}

export function toggleResolved(id: string): void {
  const thread = getThreads().find((t) => t.id === id);
  if (!thread) return;
  commit(setThreadStatus(getThreads(), id, thread.status === 'open' ? 'resolved' : 'open'));
}

export function react(id: string, commentIndex: number, emoji: string): void {
  commit(reactToComment(getThreads(), id, commentIndex, emoji, currentUser()));
}

/** Delete a thread and strip its anchors from the document. */
export function deleteThread(view: EditorView, id: string): void {
  const anchors: Array<{ from: number; to: number }> = [];
  view.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'html') return true;
    const value = String(node.attrs.value ?? '');
    if (value === anchorStart(id) || value === anchorEnd(id)) {
      anchors.push({ from: pos, to: pos + node.nodeSize });
    }
    return true;
  });
  if (anchors.length) {
    let tr = view.state.tr;
    // Delete back-to-front so earlier positions stay valid.
    for (const a of anchors.reverse()) tr = tr.delete(a.from, a.to);
    view.dispatch(tr);
  }
  commit(removeThread(getThreads(), id));
}

/** Select a thread's anchored region so the panel and the text stay in step. */
export function revealThread(view: EditorView, id: string): void {
  const range = findCommentRanges(view.state.doc).find((r) => r.id === id);
  if (!range) return;
  const selection = TextSelection.create(view.state.doc, range.from, range.to);
  view.dispatch(view.state.tr.setSelection(selection));
  view.focus();
  // ProseMirror's `tr.scrollIntoView()` is a no-op when the scroll container is the webview
  // page body (verified in the browser harness), so scroll the region's own DOM node in — that
  // walks up to whatever the real scroll parent is (#6).
  const sel = typeof CSS !== 'undefined' ? CSS.escape(id) : id;
  const el = view.dom.querySelector(`.omd-comment-highlight[data-thread="${sel}"]`);
  el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
