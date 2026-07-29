# Changelog

All notable changes to OMD are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project aims to follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
  ships no `node_modules` — it dropped from ~59 MB to under 3 MB.
- **Export to HTML** now preserves the *OMD* rendering (styled callouts, link cards, tabs, galleries —
  content only, no editing chrome) rather than the plain-GitHub view (that's the preview panel's job).

### Security

- **HTML export is sanitized** — active content a malicious source doc could smuggle in via raw HTML
  (`<script>`, `on*=` handlers, `javascript:`/`data:text-html` URLs) is stripped from the exported
  file, while the trusted injected SVG/highlighting/block wrappers are preserved.
- **Link-card fetch is SSRF-guarded** — the target hostname is resolved and rejected if it maps to a
  private/loopback/link-local/reserved address, re-checked on every redirect hop.

## [0.0.1] — unreleased

Initial pre-release: a VS Code custom editor that renders `.md` as a finished, WYSIWYG document —
callouts, tables, task lists, code, Mermaid, math, charts, smart blocks, comments, references, and
backlinks — while the file on disk stays plain, GitHub-renderable markdown, byte-for-byte on save.
