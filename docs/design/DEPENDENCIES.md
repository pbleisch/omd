# OMD — Dependencies

The corpus leaves module layout open, but the **library choices are not incidental** — several
determine output fidelity and the look, so swapping them silently changes the product. This doc
captures *which choices matter and why*, not the manifest: **[`package.json`](../../package.json)
is the source of truth** for the full list and the exact versions. What lives here is the
reasoning you can't recover from a version number — the anti-choices, the traps, and the
non-obvious splits.

If you believe a substitution is warranted, record it as an entry in [`DECISIONS.md`](DECISIONS.md)
first — because these were chosen for fidelity reasons that aren't obvious until something looks
wrong. Treat the **library** as the commitment; the pinned version is just a tested starting point.

## The editor

- **Milkdown** (`@milkdown/*`, with the CommonMark + GFM presets) is the editor framework: a
  ProseMirror wrapper with markdown ↔ document transforms. The whole plugin model stands on its
  NodeView/decoration primitives, and the presets are the round-trip baseline. The listener plugin
  drives editor → host sync; the slash plugin bridges Milkdown's slash provider to OMD's UI.
- **ProseMirror (`prosemirror-*`) is transitive — never add it as a direct dependency.** It comes
  in through Milkdown; a second, mismatched copy in the bundle breaks the editor. Plugins import
  from it directly and the bundler resolves the one transitive copy.

## Fidelity-critical rendering (the non-obvious ones)

These are where a "reasonable substitute" quietly degrades the product.

- **Shiki** for syntax highlighting — uses VS Code's own TextMate grammars and themes, so code
  matches the user's editor exactly. **Not highlight.js, not Prism** — those don't match, which
  shows immediately. Use the JS engine (no WASM to ship), and highlight inline code, not just fences.
- **Chart.js** for the chart block — its type set, resize handling, and PNG capture are what the
  block's spec assumes. **Do not hand-roll a canvas renderer** — it won't match.
- **Two math engines, on purpose.** **KaTeX** renders math in the editor (fast, no network);
  **MathJax** renders math for *export*, host-side LaTeX → pure SVG with no DOM. The export path
  can't reuse the editor's KaTeX, so the two engines serve two contexts — that's deliberate, not
  redundant.
- **Mermaid v11 specifically** for diagrams — earlier majors render differently, so the major
  version is a fidelity fact, not just a pin.
- **Handlebars** for smart-block output templates — auto-escaping plus the block helper set.

## Export / preview and data

- The export/preview pipeline is **unified + remark** (with `remark-gfm`/`remark-html`/
  `remark-frontmatter`) — markdown → HTML. **Not `marked`.**
- **`github-markdown-css`** styles HTML/PDF export and wiki preview to look like GitHub.
- YAML is parsed with `yaml` in the editor pipeline and `js-yaml` on the host (comment threads,
  block manifests).
- **`@vscode/codicons`** is the icon font for all chrome (see [`STYLE.md`](STYLE.md)).

## Build and test

- **Two pipelines, both required.** The host is TypeScript compiled by `tsc` (CommonJS, targeting
  the VS Code Node runtime). The editor/webview is bundled by **esbuild** into a single browser
  IIFE, with `.css` loaded through esbuild's `text` loader — that's what makes the CSS-as-text
  approach in [`DECISIONS.md`](DECISIONS.md) work.
- `@types/vscode` tracks `engines.vscode` — keep them in step.
- Tests: **vitest** for unit/round-trip; `@vscode/test-cli` + `@vscode/test-electron` for
  integration tests that launch a real VS Code.

## The split rule (dependencies vs devDependencies)

The rule isn't "runtime vs tooling" — it's *whether esbuild inlines it*:

- Libraries **esbuild bundles into the webview** (Milkdown, ProseMirror) can be `devDependencies` —
  they end up inside the bundle, not loaded from `node_modules` at runtime.
- Libraries the **host requires at runtime** (MathJax, `js-yaml`, the remark stack) and webview
  libraries **referenced outside the single bundle entry** (Shiki, Chart.js, KaTeX, Mermaid,
  Handlebars, `github-markdown-css`, `remark-frontmatter`, `yaml`, `@milkdown/plugin-slash`) must be
  runtime `dependencies`.

## Not present

No third-party AI/LLM libraries or SDKs. The AI features' model calls use VS Code's **built-in**
language-model API (`vscode.lm`, in `@types/vscode`) — no added dependency, no bundled model, no
API keys held by OMD. See [`DECISIONS.md`](DECISIONS.md).
