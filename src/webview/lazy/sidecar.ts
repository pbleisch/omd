/**
 * On-demand loading of the heavy webview libraries — mermaid, Shiki, Chart.js — so a plain prose
 * document never parses machinery it never touches (docs/operations/PERFORMANCE.md).
 *
 * Each library is built as its own self-contained IIFE **sidecar** bundle in `media/`
 * (see `esbuild.mjs`) that publishes one global; the surface pulls it in with a `<script>` tag the
 * first time a document actually needs it. This is deliberately *not* esbuild code splitting:
 * splitting requires `format: 'esm'`, and the chunks it emits are fetched by the browser with no
 * nonce — so making them load at all would mean widening the webview's `script-src 'nonce-…'`.
 * A script tag we create ourselves carries the nonce, so the CSP stays exactly as strict as it was.
 *
 * Both the nonce and the `media/` base come from the `<script>` that loaded this bundle — the host
 * already wrote both into the page, so nothing new crosses the host↔webview boundary.
 *
 * Used by both webview surfaces: the editor (`src/webview/`) and the GitHub-preview panel client
 * (`src/panel/`). It touches the DOM, so it can't live in `src/shared/` — that tree is also
 * compiled for the Node host (`tsconfig.host.json`, no DOM lib).
 */

// Captured while our own bundle is executing, which is the only time `currentScript` names it.
const boot = document.currentScript as HTMLScriptElement | null;

/** The nonce the host stamped on our `<script>`; a sidecar must carry the same one to run. */
// Read the IDL property first: browsers blank the *content* attribute once CSP is active
// ("nonce hiding") but keep the value reachable here.
const NONCE = boot?.nonce || boot?.getAttribute('nonce') || '';

/** `media/`, as this surface sees it — a `vscode-webview-resource:` URI in the real host. */
const BASE = boot?.src ? boot.src.replace(/[^/]+$/, '') : '';

const loads = new Map<string, Promise<void>>();

/** Load a sidecar bundle from `media/` once. Concurrent callers share the one load. */
export function loadSidecar(file: string): Promise<void> {
  const existing = loads.get(file);
  if (existing) return existing;
  const load = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    if (NONCE) el.nonce = NONCE;
    el.src = BASE + file;
    el.addEventListener('load', () => resolve(), { once: true });
    el.addEventListener(
      'error',
      () => {
        loads.delete(file); // a later use may retry rather than inherit a dead promise
        reject(new Error(`could not load ${file}`));
      },
      { once: true }
    );
    document.head.appendChild(el);
  });
  loads.set(file, load);
  return load;
}

/**
 * Resolve the global a sidecar publishes, loading it first if it isn't there yet. `pick` is
 * re-read after the load so an already-present runtime (a second surface, a reload) costs nothing.
 */
export async function loadGlobal<T>(file: string, pick: () => T | undefined): Promise<T> {
  const ready = pick();
  if (ready) return ready;
  await loadSidecar(file);
  const loaded = pick();
  if (!loaded) throw new Error(`${file} loaded but published no API`);
  return loaded;
}
