# Changelog

All notable changes to OMD are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project aims to follow
[Semantic Versioning](https://semver.org/spec/v0.1.2.html).

## [Unreleased]

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
