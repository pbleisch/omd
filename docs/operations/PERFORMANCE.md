# OMD Performance

Where OMD spends bytes and time, what's been done, and the baselines to measure before 1.0.

_Last reviewed: 2026-08 (v0.1.4)._

## Shipped artifact size

Both processes are bundled with esbuild and minified for release builds. The heavy feature
libraries are **not** in the editor bundle — they load on demand (see the next section):

| File | **Minified (shipped)** | Loaded |
|---|---|---|
| `media/webview.js` (editor) | **1.34 MB** | always |
| `media/mermaid.min.js` (runtime) | 3.57 MB | first diagram (also inlined into an export) |
| `media/omd-shiki.js` (engine + themes + grammars) | 1.28 MB | first fence in a known language |
| `media/omd-chart.js` (Chart.js) | 0.21 MB | first chart block |
| `media/panel.js` (GitHub-preview client) | 1.5 kB | with the preview panel |
| `dist/extension.js` (host) | **3.75 MB** | at activation, but see below |
| Everything shipped (bundles + CSS) | **10.2 MB** | — |

What a document actually loads in the editor, compared with loading everything eagerly (the shape
before the on-demand split):

| Document | Was | Now |
|---|---|---|
| Plain prose | 6.02 MB | **1.34 MB** (−78%) |
| One diagram | 6.02 MB | 4.91 MB (−18%) |
| Diagram + chart + code fence | 6.02 MB | 6.39 MB (+6%) |

The worst case is slightly larger because each sidecar is self-contained and can't share its
transitive dependencies with the entry — but those bytes arrive after first paint, only for a
document that uses all three. Measured in an Extension Development Host, click → diagram on screen
is **~430 ms** (median of 3, cold profile) versus **~610 ms** when mermaid was bundled: the smaller
entry parses and evaluates faster than the extra fetch costs.

Bundling the host removed ~200 MB / ~19k files of `node_modules` from the `.vsix`; minification
roughly halves each bundle.

## What loads when

**Webview.** The editor bundle carries OMD's own code plus prosemirror/milkdown and KaTeX
(~1.34 MB). Everything heavier is a **sidecar** — a separate IIFE bundle in `media/` that publishes
one global and is pulled in with a `<script>` tag on first use (`src/webview/lazy/sidecar.ts`):

| Sidecar | Size | Loaded when |
|---|---|---|
| `mermaid.min.js` (mermaid + `@mermaid-js/parser` + `cytoscape` + lodash) | 3.57 MB | a document has a ```mermaid fence |
| `omd-shiki.js` (`shiki/core` + engine + themes + `@shikijs/langs`) | 1.28 MB | a fence resolves to a known language |
| `omd-chart.js` (`chart.js/auto`) | 0.21 MB | a chart block draws |

Sidecars rather than esbuild code splitting, deliberately: splitting needs `format: 'esm'`, and the
browser fetches those chunks with **no nonce**, so it would force widening the webviews'
`script-src 'nonce-…'` CSP. It also measured *worse* — the splitter hoists everything shared
between eager and lazy code back into a chunk the entry imports statically (2.46 MB eager, versus
1.34 MB with sidecars). A `<script>` tag OMD creates itself carries the nonce, so the policy is
unchanged. `test/lazy-libraries.test.ts` is the regression gate.

**Host** (`dist/extension.js`). Everything only the export and preview need is behind a dynamic
`import()`, so activation never evaluates it:

| Module | Size | Evaluated when |
|---|---|---|
| `mathjax-full` | ~2.5 MB | exporting or previewing a document that contains `$` |
| `@shikijs/langs` + `katex` + remark/unified stack | ~2.3 MB | first export or preview render |

Loading the host bundle (what activation pays) dropped from **69 ms to 36 ms**, and heap after load
from 24.6 MB to 16.9 MB.

## Remaining levers

1. **Load only the Shiki grammars a document uses**, rather than all of `@shikijs/langs` — the
   sidecar is still all-or-nothing at 1.28 MB.
2. **KaTeX (~0.6 MB) is still eager in the editor bundle** — it could become a fourth sidecar,
   loaded on the first `$…$`.
3. Keep minification on for release (done); the shipped source maps are already excluded from the
   `.vsix`.

## Runtime baselines to establish (needs the real host)

These can't be measured in jsdom/preview; capture them in the Extension Development Host or an
instrumented integration test, then track against these first targets:

| Metric | How to measure | Initial target |
|---|---|---|
| Extension activation → first paint | `console.time` around `resolveCustomTextEditor` → editor `ready` | < 300 ms cold on a small doc |
| First render of a large doc (~5k lines) | time from `setDocument` to editor idle | < 1 s |
| Keystroke → serialize latency | the edit debounce is 300 ms; measure serialize+diff cost per change | serialize < 50 ms on a large doc |
| Large table (100×20) interaction | typing/selection responsiveness | no perceptible lag |
| Many blocks (100+ smart blocks) | scroll + edit responsiveness | no perceptible lag |

## Notes

- The editor→host sync is debounced (300 ms) and guarded by a normalized-equality check, so idle
  typing does not thrash the host or disk.
- Derived blocks (`toc`, `chart`) recompute on change but never serialize their output, so they add
  render cost, not file churn.
- The unit suite (514 tests) runs in ~6 s locally, a good pre-commit signal.
