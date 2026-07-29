import type { Thread } from '../../shared/threads';

/**
 * The editor's view of the comment threads the host owns. The editor renders them (highlights,
 * and later the thread panel) but never serializes them — the host re-attaches the metadata
 * block on write, which is what makes it impossible for an editor round-trip to lose comments.
 */
let threads: Thread[] = [];
const byId = new Map<string, Thread>();
type Listener = () => void;
const listeners = new Set<Listener>();

export function setThreads(next: Thread[]): void {
  threads = next;
  byId.clear();
  for (const t of next) byId.set(t.id, t);
  listeners.forEach((fn) => fn());
}

export function getThreads(): Thread[] {
  return threads;
}

export function getThread(id: string): Thread | undefined {
  return byId.get(id);
}

export function onThreadsChanged(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
