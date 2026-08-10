# Changelog

All notable changes to OMD are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project aims to follow
[Semantic Versioning](https://semver.org/spec/v0.1.2.html).

## [Unreleased]

### Added

- **Alt+Up / Alt+Down move the block under the cursor.** The unit that moves is the deepest
  ancestor with a sibling in that direction, so the same keys reorder list items (including their
  nested sublists), paragraphs inside a multi-paragraph item, blocks inside a blockquote, and
  top-level blocks. Nesting depth never changes, front matter stays anchored, the selection travels
  with the block, and inside a table the keys move the row. At a boundary the command returns
  `false` so the key falls through. Also on the context menu as **Move up** / **Move down**.
  A GitHub alert's hidden `[!NOTE]` marker line is anchored like front matter, so a body block
  can never step over it and quietly turn the callout into a plain blockquote — the walk-up
  continues outward and the whole alert moves instead. Each move is its own undo entry, so
  repeated presses undo one at a time rather than collapsing into a single step.

### Changed

- **Feature libraries load on demand, not on every document.** mermaid, Shiki and Chart.js used to
  be bundled into the editor, so a plain prose document parsed ~4.7 MB of machinery it never
  touched; MathJax was evaluated at activation whether or not anything was exported. Each now loads
  the first time a document actually needs it: mermaid for a ```mermaid fence (reusing the
  standalone runtime already shipped for the HTML export), Shiki for a fence in a language OMD
  knows, Chart.js for a chart block, MathJax for an export or preview whose text contains math.
  A plain prose document's editor payload drops from **6.02 MB to 1.34 MB**, everything shipped in
  the `.vsix` from 16.8 MB to 10.2 MB, the GitHub-preview panel client from 3.46 MB to 1.5 kB, and
  loading the host bundle at activation from 69 ms to 36 ms. A document *with* a diagram reaches
  its first rendered diagram faster than before (~430 ms versus ~610 ms), because the smaller
  bundle parses faster than the deferred fetch costs; while a diagram is being prepared for the
  first time the block says so rather than sitting empty. Each library is its own bundle in
  `media/`, loaded by a `<script>` carrying the webview's nonce, so the strict
  `script-src 'nonce-…'` CSP is unchanged. ([#18](https://github.com/pbleisch/omd/issues/18))

### Fixed

- **Text holding both an HTML entity and a backslash escape no longer grows on every save.** The
  entity plugin preserves a writer's `&amp;` spelling by re-reading the raw source bytes for the
  text run around it, but that raw slice still carried the backslash escapes the parser had already
  consumed. They came back as literal backslash *content*, were escaped again on save, and doubled
  every generation — so `a \&amp; b` reached 32 backslashes in five saves, unbounded. The scan is
  now escape-aware: `\x` resolves to `x` as the parser resolves it, and a backslash suppresses what
  follows, so `\&amp;` reads as an escaped ampersand rather than an entity. Entity spelling is still
  preserved byte-for-byte.
- **A document no longer reopens as front matter.** A thematic break on the first line was written
  `---`, and YAML front matter opens on any `---` at line 1 and closes on the next one anywhere
  later — prose and blank lines in between are not checked. So a document that began with a
  thematic break and contained any later `---` was one save away from re-parsing as a single front
  matter node and ceasing to be prose. The bytes round-tripped perfectly; only their meaning was
  destroyed. A document-initial thematic break is now written `***`, which GitHub renders
  identically and which cannot open front matter; every other position keeps `---`. Real front
  matter is untouched. ([#23](https://github.com/pbleisch/omd/issues/23))
- **Escaped characters survive a save.** Text with no `*`, `_` or `\` that ended in whitespace was
  written out unescaped, so a backslash the writer typed was silently dropped: an escaped pipe in a
  table cell lost its escape and the row gained a column on reopen, `\[not a ref]` became a link
  reference candidate, and `\<div>` turned literal text into inline HTML — including in OMD's own
  `docs/contributing/AUTHORING-SMART-BLOCKS.md`. Text is now always escaped through remark's
  `safe()`. Whitespace, including trailing spaces and hard breaks, is unaffected.
  ([#30](https://github.com/pbleisch/omd/issues/30))
- **Undo no longer flashes the document.** A document pushed from the host used to be applied by
  replacing the whole document: every block was re-parsed and re-rendered, every node view
  (diagram, chart, callout, code block) was torn down and rebuilt, and the selection went with it
  — on screen, the content appeared to be pasted back into place. VS Code keeps its own undo
  history over the underlying file alongside the editor's, so an undo could push a document the
  editor did not already hold and trigger exactly that repaint. A push is now applied as the
  narrowest edit that reaches it, so untouched blocks keep their DOM and the cursor stays put;
  a push that only differs by remark's normalization now costs nothing at all. A document change
  that carries no content changes (the dirty-state flip after a save) no longer pushes a document
  at all. ([#7](https://github.com/pbleisch/omd/issues/7))

## [0.1.4] — 2025-07-26

### Changed

- **Refined Marketplace listing page.** Copy edits, removed implementation comment, tightened pre-release section.

## [0.1.3] — 2026-08-05

### Added

- **Large document undo tests.** New test suite covering undo behavior on documents from 30KB to
  1.5MB, confirming `setMarkdown` dispatches zero transactions for identical content even on
  very large documents.

## [0.1.2] — 2026-08-04

### Fixed

- **Undo no longer merges separate edits into one step.** The history grouping window was
  reduced from 500ms to 200ms, so editing two lines in quick succession now undoes
  independently rather than as a single revert.

## [0.1.1] — 2026-07-29

The first build meant to be handed to someone else. Two things you will notice immediately: OMD
stays out of your way until you invite it in, and dragging table rows and columns now does what you
expect.

### Changed

- **OMD no longer takes over markdown on install.** The custom editor is registered at
  `priority: "option"` instead of `"default"`, so installing OMD changes nothing about which editor
  opens your `.md` files. Try it on a file with **OMD: Open in OMD editor**; make it permanent only
  if you want to.

### Fixed

- **Dragging a table row or column to reorder it now works.** The drop indicator followed the
  cursor, but releasing the mouse left the table unchanged — the only way to move a line was the
  overlay menu. Drag-to-reorder now lands the row or column where you dropped it.

### Added

- **OMD: Make OMD the default Markdown editor** — opts in, so `.md` files open in OMD from then on.
- **OMD: Restore the built-in Markdown editor** — the inverse, so the opt-in is reversible from
  inside OMD and you are never stuck.

  Both write at global (user) scope through `workbench.editorAssociations`, merging into the map so
  associations you already have for other file types are left untouched. Running either twice is a
  no-op, and each reports what it did with a single notification carrying the way back out.

## [0.1.0] — 2026-07-28

First pre-release. A VS Code custom editor that renders `.md` as a finished, WYSIWYG document —
callouts, tables, task lists, code, Mermaid, math, charts, smart blocks, comments, references, and
backlinks — while the file on disk stays plain, GitHub-renderable markdown, byte-for-byte on save.

Published on the Marketplace's **pre-release** channel: per the VS Code convention this project uses
odd minor versions (`0.1.x`) for pre-releases and even minors (`0.2.x`) for stable releases.

### Added

- **Inline AI revision** — select text, describe a change ("make this concise", "fix grammar"), and
  the model's rewrite appears as an **inline diff** (old struck through, new highlighted) to Accept or
  Reject. Triggered by a ✦ marker beside the selection or a "Revise with AI…" context-menu entry.
  Decoration-only: the document is untouched until you Accept, so Reject leaves the file byte-identical
  and the round-trip is never at risk. Reuses the same host-mediated, opt-in language-model plumbing as
  the AI block; the affordances are hidden unless `omd.ai.enabled`.
- **AI block** (`ai`) — a smart block that runs an embedded prompt against a VS Code language model
  (`vscode.lm`, e.g. GitHub Copilot) and caches the generated markdown in its body, so a GitHub reader
  sees the result and the file round-trips. A **Result/Prompt tab pair** (like the chart block) keeps
  the generated result in view by default, with the prompt, context, and model one click away. The
  **model picker is a dropdown** of the models actually installed (discovered host-side and pushed to
  the editor), falling back to a free-text field when none are available. **Off by default**
  (`omd.ai.enabled`); the host owns the model call (the webview has no network); it runs only on an
  explicit Run, never on load; a per-block context `scope` (`none`/`document`) and optional `model`
  override the `omd.ai.model` default. Requires VS Code ≥ 1.90 and a chat-model provider installed.
- **Date picker** — clicking a `📅 YYYY-MM-DD` chip opens a calendar popover that writes the chosen
  date back into the token.
- **Link card block** — a smart block that renders a rich preview card (title, description, site,
  thumbnail) over a plain `[title](url)` link. Preview metadata is fetched host-side only on an
  explicit insert or refresh, never on document load.
- **GitHub preview panel** (`OMD: Open GitHub Preview`) — a live side-by-side "render like GitHub"
  view: GFM alerts, syntax highlighting, a front-matter table, math, and natively-rendered mermaid.
- **Inline document problems** — replacing the Problems-panel integration, problems are marked in the
  editor: wavy underlines on bad/empty/anchor links, an error banner on invalid YAML front matter,
  and a document-issues chip on the toolbar aggregating everything (incl. structural checks).

### Changed

- The extension host is now bundled with esbuild (`dist/extension.js`), so the packaged `.vsix`
  ships no `node_modules` — it dropped from ~59 MB to ~4.3 MB.
- **Export to HTML** now preserves the *OMD* rendering (styled callouts, link cards, tabs, galleries —
  content only, no editing chrome) rather than the plain-GitHub view (that's the preview panel's job).

### Security

- **HTML export is sanitized** — active content a malicious source doc could smuggle in via raw HTML
  (`<script>`, `on*=` handlers, `javascript:`/`data:text-html` URLs) is stripped from the exported
  file, while the trusted injected SVG/highlighting/block wrappers are preserved.
- **Link-card fetch is SSRF-guarded** — the target hostname is resolved and rejected if it maps to a
  private/loopback/link-local/reserved address, re-checked on every redirect hop.
