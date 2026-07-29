import type { Backlink } from '../../shared/references';

/** Backlinks the host discovered for this document; replaced whole on each scan. */
let backlinks: Backlink[] = [];
type Listener = () => void;
const listeners = new Set<Listener>();

export function setBacklinks(next: Backlink[]): void {
  backlinks = next;
  listeners.forEach((fn) => fn());
}

export function getBacklinks(): Backlink[] {
  return backlinks;
}

export function onBacklinksChanged(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
