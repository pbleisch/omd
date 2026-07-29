import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

/**
 * Comment threads on disk (docs/design/FORMATS.md). Collaboration travels with the document in Git
 * rather than living in a sidecar, so the metadata is one trailing HTML comment holding YAML,
 * placed after all document content, and the text a thread refers to is wrapped in place by an
 * invisible anchor pair keyed to the thread id:
 *
 *   The quick <!-- omd-start:t1 -->brown fox<!-- omd-end:t1 --> jumps.
 *
 *   <!-- omd-threads
 *   - id: t1
 *     status: open
 *     comments:
 *       - author: alice
 *         body: This needs a citation.
 *         date: 2026-01-02T10:00:00Z
 *   -->
 *
 * A thread binds to a *region*, not a copied string, which is why the anchors exist at all.
 * Reactions are deliberately a map of emoji → users, never an array of objects.
 */

export interface ThreadComment {
  author: string;
  body: string;
  date: string;
  /** emoji → the users who reacted with it. */
  reactions?: Record<string, string[]>;
}

export interface Thread {
  id: string;
  status: 'open' | 'resolved';
  comments: ThreadComment[];
}

const OPENER = '<!-- omd-threads';
/** The trailing metadata block: opener on its own line, YAML, then the closer. */
const BLOCK_RE = /\n*<!-- omd-threads\n([\s\S]*?)\n-->\s*$/;

/** `<!-- omd-start:t1 -->` / `<!-- omd-end:t1 -->`. */
const ANCHOR_RE = /^<!--\s*omd-(start|end):([A-Za-z0-9_-]+)\s*-->$/;

export const anchorStart = (id: string): string => `<!-- omd-start:${id} -->`;
export const anchorEnd = (id: string): string => `<!-- omd-end:${id} -->`;

/** Identify an anchor comment, or null if the html isn't one. */
export function matchAnchor(html: string): { kind: 'start' | 'end'; id: string } | null {
  const m = ANCHOR_RE.exec(html.trim());
  return m ? { kind: m[1] as 'start' | 'end', id: m[2] } : null;
}

function normalizeReactions(raw: unknown): Record<string, string[]> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, string[]> = {};
  for (const [emoji, users] of Object.entries(raw as Record<string, unknown>)) {
    const list = Array.isArray(users) ? users.filter((u): u is string => typeof u === 'string') : [];
    if (list.length) out[emoji] = list;
  }
  return Object.keys(out).length ? out : undefined;
}

function normalizeComment(raw: unknown): ThreadComment | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.author !== 'string' || typeof o.body !== 'string') return null;
  const comment: ThreadComment = {
    author: o.author,
    body: o.body,
    // Dates may arrive as a YAML timestamp; keep the ISO string form.
    date: o.date instanceof Date ? o.date.toISOString() : String(o.date ?? '')
  };
  const reactions = normalizeReactions(o.reactions);
  if (reactions) comment.reactions = reactions;
  return comment;
}

function normalizeThread(raw: unknown): Thread | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id) return null;
  const comments = Array.isArray(o.comments)
    ? o.comments.map(normalizeComment).filter((c): c is ThreadComment => c !== null)
    : [];
  return {
    id: o.id,
    status: o.status === 'resolved' ? 'resolved' : 'open',
    comments
  };
}

/**
 * Split a document into its body and its thread metadata. The body is returned without the
 * trailing block so the editor only ever sees prose; malformed YAML yields no threads and the
 * block is left in the body rather than silently discarded — losing a reviewer's comments to a
 * parse error would be far worse than showing the raw block.
 */
export function splitThreads(text: string): { body: string; threads: Thread[] } {
  const m = BLOCK_RE.exec(text);
  if (!m) return { body: text, threads: [] };
  let parsed: unknown;
  try {
    parsed = parseYaml(m[1]);
  } catch {
    return { body: text, threads: [] };
  }
  if (!Array.isArray(parsed)) return { body: text, threads: [] };
  const threads = parsed.map(normalizeThread).filter((t): t is Thread => t !== null);
  return { body: text.slice(0, m.index).replace(/\s*$/, '\n'), threads };
}

/** Render the trailing metadata block, or '' when there is nothing to store. */
export function serializeThreads(threads: Thread[]): string {
  if (threads.length === 0) return '';
  const yaml = stringifyYaml(threads).trimEnd();
  return `${OPENER}\n${yaml}\n-->\n`;
}

/** Re-attach thread metadata to a document body. */
export function withThreads(body: string, threads: Thread[]): string {
  const block = serializeThreads(threads);
  if (!block) return body;
  return `${body.replace(/\s*$/, '')}\n\n${block}`;
}

/** The next free thread id (`t1`, `t2`, …). */
export function nextThreadId(threads: Thread[]): string {
  let max = 0;
  for (const t of threads) {
    const m = /^t(\d+)$/.exec(t.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `t${max + 1}`;
}

/**
 * Thread mutations. All pure: they take the thread list and return a new one, so the panel,
 * the host, and the tests all agree on what an action means. The host remains the only writer
 * to disk.
 */

/** Start a thread with its first comment. */
export function createThread(threads: Thread[], id: string, comment: ThreadComment): Thread[] {
  return [...threads, { id, status: 'open', comments: [comment] }];
}

/** Append a reply. */
export function addComment(threads: Thread[], id: string, comment: ThreadComment): Thread[] {
  return threads.map((t) => (t.id === id ? { ...t, comments: [...t.comments, comment] } : t));
}

/** Resolve or reopen a thread. */
export function setThreadStatus(
  threads: Thread[],
  id: string,
  status: Thread['status']
): Thread[] {
  return threads.map((t) => (t.id === id ? { ...t, status } : t));
}

/** Remove a thread entirely (its anchors are removed separately, in the document). */
export function removeThread(threads: Thread[], id: string): Thread[] {
  return threads.filter((t) => t.id !== id);
}

/** Toggle a reaction on one comment of one thread. */
export function reactToComment(
  threads: Thread[],
  id: string,
  commentIndex: number,
  emoji: string,
  user: string
): Thread[] {
  return threads.map((t) =>
    t.id === id
      ? {
          ...t,
          comments: t.comments.map((c, i) =>
            i === commentIndex ? toggleReaction(c, emoji, user) : c
          )
        }
      : t
  );
}

/** Toggle a user's reaction on a comment, keeping the emoji → users shape. */
export function toggleReaction(
  comment: ThreadComment,
  emoji: string,
  user: string
): ThreadComment {
  const reactions = { ...(comment.reactions ?? {}) };
  const users = reactions[emoji] ?? [];
  const next = users.includes(user) ? users.filter((u) => u !== user) : [...users, user];
  if (next.length) reactions[emoji] = next;
  else delete reactions[emoji];
  const out: ThreadComment = { ...comment };
  if (Object.keys(reactions).length) out.reactions = reactions;
  else delete out.reactions;
  return out;
}
