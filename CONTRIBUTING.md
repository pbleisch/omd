# Contributing to OMD

Thanks for your interest in OMD. This document covers the architecture, how to build and test, and
the non-obvious invariants that keep the round-trip honest. Start at [`docs/README.md`](docs/README.md)
for the full documentation map; the design rationale is in [`docs/design/`](docs/design/)
(VISION → PRINCIPLES → ARCHITECTURE → SMART-BLOCKS → FORMATS → STYLE), and task-oriented how-tos for
extending OMD are in [`docs/contributing/`](docs/contributing/).

## Architecture

Two processes talking only by message passing (`src/shared/messages.ts`):

- **Host** (`src/host/`, `tsc` for typecheck + `esbuild` → `dist/extension.js`) — owns the file and
  the sync loop; the single source of truth on disk. `OmdEditorProvider` is the
  `CustomTextEditorProvider`.
- **Editor** (`src/webview/`, `esbuild` → `media/webview.js`) — a Milkdown/ProseMirror rich view
  over the *same* markdown. Plugins add capabilities; CSS ships as text and is injected once.

The document model is markdown end-to-end — the editor is a rich view over GFM, never a separate
format converted at save. That's what makes the round-trip achievable.

## Build & run

```bash
npm install
npm run build             # tsc (typecheck + out/) + esbuild (dist/extension.js, media/webview.js)
npm run lint              # eslint (flat config)
npm test                  # round-trip + rendering unit tests (vitest, jsdom)
npm run test:integration  # host suite in a real VS Code (@vscode/test-electron)
```

The jsdom unit tests can't reach the extension host, so host-only behaviour (backlinks, diagnostics,
save/round-trip, doc lifecycle) is covered by `test:integration`, which launches a real VS Code over
a fixture wiki (`src/integration-test/fixtures/wiki`) and runs Mocha *inside* the extension host. It
downloads VS Code on first run and needs a display (use `xvfb-run` in CI); the webview DOM still
isn't reachable from it, so webview-side behaviour stays in the jsdom / preview tests.

Press **F5** in VS Code to launch an Extension Development Host (**Run OMD Extension** opens the
repo; **Run OMD (showcase wiki)** opens `showcase/`), then open any `.md`. The `showcase/` folder is
a self-contained demo wiki that exercises every feature.

For fast visual iteration without launching VS Code, `test/preview/index.html` runs the webview
bundle in a plain browser (it stubs `acquireVsCodeApi` and feeds a sample document):

```bash
npm run build:webview
npx http-server -p 8791 .
#   http://localhost:8791/test/preview/index.html
#   http://localhost:8791/test/preview/index.html?doc=showcase/Media.md
```

Note: the preview harness can't reproduce real pointer drags, native text selection, or host
round-trips — verify those in the Extension Development Host.

## Round-trip fidelity notes

The round-trip is enforced by the test corpus, which boots the real editor in jsdom and asserts
open→save is byte-identical after whitespace normalization (`src/shared/roundtrip.ts`). Non-obvious
invariants already in place:

- The serializer is configured to GFM conventions (`-` bullets, `---` rules, one-space list indent).
- Milkdown stored list `spread` as a truthy *string*, forcing every list loose; it's now a faithful
  boolean, so tight and loose lists round-trip and task checkboxes survive (`plugins/tight-lists.ts`).
- GitHub alert markers are unescaped (`\[!NOTE]` → `[!NOTE]`) so alerts render on GitHub
  (`plugins/serialize-fixups.ts`).
- Table delimiter dash-count and cell padding are made comparison-agnostic, so the host's loop guard
  never rewrites an untouched table.
- Math is a real schema node via `remark-math` (micromark tokenizes the LaTeX raw), not a decoration
  overlay — decorations mangle `\,` and `\int_` inside prose and break the round-trip.
- Smart-block shortcodes are real schema nodes (`plugins/shortcode/`): a remark transformer folds
  shortcode comments into nodes; the delimiter bytes live in attrs and are re-emitted verbatim, and a
  container's body stays real markdown nodes. Milkdown's remark parses a full-line `<!-- omd:… -->`
  as a *paragraph wrapping an inline `html` node*, so the pairing transform recognizes both shapes.
- The template trust tier is a **safe eval-free subset** (`blocks/template.ts`), not real Handlebars:
  the webview CSP forbids `unsafe-eval`, and Handlebars compiles with `new Function`. Author code and
  full Handlebars belong to the sandboxed-iframe tier.
- The sandboxed tier (`blocks/sandbox.ts`) runs author code in an `allow-scripts` iframe *without*
  `allow-same-origin` (opaque origin, no DOM/cookie reach) carrying its own `default-src 'none'` CSP
  (no network). Discovered author code is forced to this tier at parse time.
- A NodeView must never mutate its own `contentDOM` for view-only state (ProseMirror's mutation
  observer redraws it). Visibility is a class on the wrapper; `ignoreMutation` ignores attribute
  changes and anything outside `contentDOM`.
- Export and the editor use **two math engines on purpose**: KaTeX in the webview (fast), MathJax
  host-side for self-contained SVG in exported HTML.
- Comment metadata never reaches the editor: `splitThreads` runs host-side on every push, so the
  webview only ever holds the document body; `withThreads` re-attaches on every write. The editor
  cannot destroy comments during a round-trip because it never holds them.
- A block whose output is *derived* (`toc` from headings, `chart` from its body table) never
  serializes that output — the file keeps only the shortcode and the source content.
- Wikilinks need a serialize fix-up (remark escapes `\[\[`); `serialize-fixups.ts` unescapes them,
  requiring the closing `]]` so it never touches genuinely escaped brackets.

## Adding a smart block

Blocks are file-based and discovered from three layers (workspace → user → shipped). The full
walkthrough — the `block.json` reference, the two author render tiers, and the safety rules — is
[`docs/contributing/AUTHORING-SMART-BLOCKS.md`](docs/contributing/AUTHORING-SMART-BLOCKS.md).
Scaffold one with `npm run new:block -- <name>`; two worked examples live in
[`examples/blocks/`](examples/blocks/).

## Conventions

- TypeScript throughout; `omd-` prefix on CSS classes; theme variables first (see `docs/design/STYLE.md`).
- Every on-disk construct needs a byte-for-byte round-trip test (Principle 2).
- Keep host and editor talking only through `src/shared/messages.ts`.

## Reporting issues

Use [GitHub Issues](https://github.com/pbleisch/omd/issues) to report bugs or request features.
OMD ships issue templates — use **Bug Report** for bugs and **Feature Request** for new ideas.
