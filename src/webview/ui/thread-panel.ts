import type { EditorView } from 'prosemirror-view';
import { codicon } from '../codicons';
import { getThreads, onThreadsChanged } from '../blocks/threads-registry';
import {
  replyToThread,
  toggleResolved,
  react,
  deleteThread,
  revealThread
} from '../blocks/thread-actions';
import { currentUser } from '../blocks/identity';
import { setActiveThread, onActiveThreadChange, getActiveThread } from '../blocks/active-thread';
import { findCommentRanges } from '../plugins/comments';
import type { Thread, ThreadComment } from '../../shared/threads';

/**
 * The one thread panel (docs/design/STYLE.md — a single 300px right sidebar; there is exactly one of
 * each panel). It renders the threads the host owns and turns clicks into thread *actions*;
 * it never touches the metadata block itself.
 */

const REACTIONS = ['👍', '🎉', '👀'];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

function renderReactions(thread: Thread, comment: ThreadComment, index: number): HTMLElement {
  const row = document.createElement('div');
  row.className = 'omd-thread-reactions';
  for (const emoji of REACTIONS) {
    const users = comment.reactions?.[emoji] ?? [];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className =
      'omd-reaction' + (users.includes(currentUser()) ? ' omd-reaction--mine' : '');
    btn.title = users.length ? users.join(', ') : `React ${emoji}`;
    btn.textContent = users.length ? `${emoji} ${users.length}` : emoji;
    btn.addEventListener('click', () => react(thread.id, index, emoji));
    row.appendChild(btn);
  }
  return row;
}

function renderComment(thread: Thread, comment: ThreadComment, index: number): HTMLElement {
  const el = document.createElement('div');
  el.className = 'omd-thread-comment';

  const meta = document.createElement('div');
  meta.className = 'omd-thread-meta';
  const author = document.createElement('span');
  author.className = 'omd-thread-author';
  author.textContent = comment.author;
  const date = document.createElement('span');
  date.className = 'omd-thread-date';
  date.textContent = formatDate(comment.date);
  meta.append(author, date);

  const body = document.createElement('div');
  body.className = 'omd-thread-body';
  body.textContent = comment.body;

  el.append(meta, body, renderReactions(thread, comment, index));
  return el;
}

/**
 * Order the threads the way a reader scans the document: by where each thread's anchored region
 * first appears (top → bottom). Threads whose anchors aren't in the document (orphaned) keep
 * their metadata order and sort to the end.
 */
function orderByDocument(threads: Thread[], view: EditorView): Thread[] {
  const pos = new Map<string, number>();
  for (const r of findCommentRanges(view.state.doc)) {
    if (!pos.has(r.id)) pos.set(r.id, r.from);
  }
  const rank = (t: Thread): number => pos.get(t.id) ?? Number.POSITIVE_INFINITY;
  return threads
    .map((t, i) => ({ t, i }))
    .sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i) // stable for orphans / ties
    .map((x) => x.t);
}

function renderThread(view: EditorView, thread: Thread): HTMLElement {
  const el = document.createElement('div');
  el.className = 'omd-thread' + (thread.status === 'resolved' ? ' omd-thread--resolved' : '');
  el.dataset.thread = thread.id;
  el.title = 'Click to jump to the commented text';
  // Clicking anywhere on the card (except its own controls) reveals the document region
  // (thread → doc). The controls — resolve/delete, reactions, the reply box — opt out.
  el.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.omd-thread-actions, .omd-thread-reactions, .omd-thread-reply')) {
      return;
    }
    setActiveThread(thread.id); // highlight the region + this card
    revealThread(view, thread.id); // scroll/select the document range
  });

  const head = document.createElement('div');
  head.className = 'omd-thread-head';
  const title = document.createElement('span');
  title.className = 'omd-thread-jump';
  title.textContent = thread.status === 'resolved' ? 'Resolved' : 'Open';

  const actions = document.createElement('span');
  actions.className = 'omd-thread-actions';
  const resolve = document.createElement('button');
  resolve.type = 'button';
  resolve.className = 'omd-thread-action';
  resolve.title = thread.status === 'open' ? 'Resolve' : 'Reopen';
  resolve.appendChild(codicon(thread.status === 'open' ? 'check' : 'refresh'));
  resolve.addEventListener('click', () => toggleResolved(thread.id));

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'omd-thread-action';
  remove.title = 'Delete thread';
  remove.appendChild(codicon('trash'));
  remove.addEventListener('click', () => deleteThread(view, thread.id));

  actions.append(resolve, remove);
  head.append(title, actions);
  el.appendChild(head);

  for (const [i, c] of thread.comments.entries()) el.appendChild(renderComment(thread, c, i));

  // Reply box.
  const reply = document.createElement('form');
  reply.className = 'omd-thread-reply';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Reply…';
  input.className = 'omd-thread-input';
  reply.appendChild(input);
  reply.addEventListener('submit', (e) => {
    e.preventDefault();
    const body = input.value.trim();
    if (!body) return;
    input.value = '';
    replyToThread(thread.id, body);
  });
  el.appendChild(reply);

  return el;
}

export function mountThreadPanel(container: HTMLElement, view: EditorView): void {
  const panel = document.createElement('aside');
  panel.className = 'omd-thread-panel';

  const header = document.createElement('div');
  header.className = 'omd-thread-panel-head';
  header.append(codicon('comment'));
  const label = document.createElement('span');
  label.textContent = 'Comments';
  header.appendChild(label);

  const list = document.createElement('div');
  list.className = 'omd-thread-list';

  panel.append(header, list);
  container.appendChild(panel);

  /** Mark the active thread's card and scroll it into view. */
  const applyActive = (id: string | null): void => {
    panel.querySelectorAll<HTMLElement>('.omd-thread').forEach((el) => {
      el.classList.toggle('omd-thread--active', el.dataset.thread === id);
    });
    if (id) panel.querySelector<HTMLElement>(`.omd-thread[data-thread="${id}"]`)?.scrollIntoView({ block: 'nearest' });
  };

  const render = () => {
    const threads = orderByDocument(getThreads(), view);
    // The panel is only present when there is something to show (Principle 6 — calm chrome).
    panel.classList.toggle('omd-thread-panel--visible', threads.length > 0);
    document.body.classList.toggle('omd-has-threads', threads.length > 0);
    list.replaceChildren(...threads.map((t) => renderThread(view, t)));
    applyActive(getActiveThread()); // re-apply the active mark after a re-render
  };

  render();
  onThreadsChanged(render);
  onActiveThreadChange(applyActive); // doc → thread: reveal the clicked span's thread here
}
