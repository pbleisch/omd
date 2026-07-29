# OMD Performance

Where OMD spends bytes and time, what's been done, and the baselines to measure before 1.0.

_Last reviewed: 2026-07 (v0.0.1)._

## Shipped artifact size

Both processes are bundled with esbuild and minified for release builds:

| Bundle | Unminified | **Minified (shipped)** |
|---|---|---|
| `media/webview.js` (editor) | 11.2 MB | **5.6 MB** |
| `dist/extension.js` (host) | 3.2 MB | **2.1 MB** |
| Packaged `.vsix` | 59.4 MB (unbundled) | **~2.9 MB** |

Bundling the host removed ~200 MB / ~19k files of `node_modules` from the `.vsix`; minification
roughly halves each bundle. The minified webview was smoke-tested in the preview harness (all blocks
render, chart draws, console clean).

## What's in the bundles

Top contributors by unminified input size (from the esbuild metafiles):

**Webview** (`media/webview.js`)

| Module | Size | Needed when |
|---|---|---|
| `mermaid` + `@mermaid-js/parser` + `cytoscape` + `layout-base` | ~5.2 MB | a document contains a Mermaid diagram |
| `@shikijs/langs` | ~1.1 MB | syntax-highlighting a fenced code block |
| `katex` | ~0.6 MB | rendering math |
| `chart.js` | ~0.5 MB | a chart block is present |
| `lodash-es` + `es-toolkit` | ~1.1 MB | (transitive, mostly via mermaid) |
| OMD app code + prosemirror/milkdown core | ~1.5 MB | always |

**Host** (`dist/extension.js`)

| Module | Size | Needed when |
|---|---|---|
| `mathjax-full` | ~2.4 MB | HTML export with math |
| `katex` | ~0.6 MB | (via remark-math tooling) |
| remark/unified/micromark stack | ~0.6 MB | export |

The clear pattern: **the heavy libraries are feature-specific** (diagrams, code highlighting, math,
charts, export) yet are loaded eagerly. That's the biggest remaining lever.

## Recommendations (highest leverage first)

1. **Lazy-load feature libraries in the webview.** Dynamic-`import()` `mermaid`, `chart.js`, and
   Shiki grammars on first actual use, so a plain prose document never parses ~7 MB of code it
   doesn't need. Expected: large drop in first-render/parse cost for typical docs. (esbuild emits
   separate chunks for dynamic imports; the webview would load them on demand under the CSP.)
2. **Load only the Shiki grammars a document uses**, rather than all `@shikijs/langs`.
3. **Lazy-load `mathjax-full` in the host export path** — it's dead weight until someone exports.
4. Keep minification on for release (done); consider dropping the shipped source maps from the
   `.vsix` if size matters more than in-field debugging (they're already excluded).

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
