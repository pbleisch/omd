/**
 * The "active" comment thread — the one the user is currently looking at, shared between the
 * document highlight (comments plugin) and the thread panel so the two stay linked (#6).
 * Clicking a commented span sets it (the panel reveals the thread); clicking a thread sets it
 * (the document region highlights). One tiny observable; no DOM, no editor coupling.
 */

let activeId: string | null = null;
type Listener = (id: string | null) => void;
const listeners = new Set<Listener>();

export function getActiveThread(): string | null {
  return activeId;
}

/** Set (or clear) the active thread and notify listeners; always fires so a re-click re-reveals. */
export function setActiveThread(id: string | null): void {
  activeId = id;
  listeners.forEach((fn) => fn(id));
}

export function onActiveThreadChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
