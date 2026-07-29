/**
 * Document zoom (Phase 6). Scales the writing surface only — the toolbar and panels stay
 * fixed — by driving a `--omd-zoom` multiplier the `#omd-root` font-size keys off (styles.css).
 * State is a single module-level value; subscribers (the toolbar label) are notified on change.
 */

const MIN = 50;
const MAX = 200;
const STEP = 10;

let zoom = 100;
type Listener = (zoom: number) => void;
const listeners = new Set<Listener>();

function apply(): void {
  document.documentElement.style.setProperty('--omd-zoom', String(zoom / 100));
  listeners.forEach((fn) => fn(zoom));
}

export function getZoom(): number {
  return zoom;
}

export function setZoom(next: number): void {
  zoom = Math.min(MAX, Math.max(MIN, Math.round(next / STEP) * STEP));
  apply();
}

export function zoomIn(): void {
  setZoom(zoom + STEP);
}

export function zoomOut(): void {
  setZoom(zoom - STEP);
}

export function resetZoom(): void {
  setZoom(100);
}

/** Subscribe to zoom changes; returns an unsubscribe. Fires once immediately. */
export function onZoomChange(fn: Listener): () => void {
  listeners.add(fn);
  fn(zoom);
  return () => listeners.delete(fn);
}
