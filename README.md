# OMD — Edit documents, not markup

<div align="center">

<img src="icon.png" width="200" alt="OMD">

</div>

OMD is a VS Code WYSIWYG editor for `.md` files that lets you visually edit markdown elements —  callouts,
tables, task lists, code, diagrams, charts, comments — while the file on disk stays **plain,
GitHub-renderable markdown**.

**The round-trip is the point:** open a file, save it without editing, and it comes back
byte-for-byte. OMD is a rich *view* over your markdown, never a separate format converted at save —
so nothing about your file is proprietary, and it renders the same on GitHub as it does here.

## Features

- **Rich rendering of plain GFM** — GitHub alert callouts, task-list checkboxes, syntax-highlighted
  code, Mermaid diagrams, and KaTeX math, all edited inline.
- **Smart blocks** — insert with `/`: callouts, collapsible sections, tabs, columns, an interactive
  **chart** (backed by a real data table), YouTube embeds, image galleries, a live table of
  contents, dates, footnotes, and **link cards** (rich URL previews). Each serializes to a form a
  plain markdown reader still understands.
- **Spreadsheet-style tables** — overlay controls, move/sort columns and rows, keyboard navigation,
  and high-fidelity copy/paste to and from Excel, Sheets, and Word.
- **Comments & collaboration** — thread a comment on any selection; comments live *in the file* and
  survive every round-trip.
- **References & backlinks** — `[[wikilinks]]`, `@mentions`, and `#issues` render as real links;
  backlinks across the workspace show in the sidebar.
- **Export** — one-click self-contained HTML (print to PDF from there).
- **Wiki-aware** — edits a cloned GitHub Wiki's flat page set correctly, including the space↔dash
  page-name mapping.

## Getting started

1. Install OMD from the VS Code Marketplace (or `code --install-extension omd.vsix`).
2. Open any `.md` file — OMD is the default editor for markdown. To open a specific file the plain
   way, use **OMD: Reopen as plain text**; to switch back, **OMD: Open in OMD editor**.
3. Press `/` in the document for the block menu, or use the toolbar.

New to it? Open the bundled **`showcase/`** wiki in the source repo — it exercises every feature.

## Privacy & network use

OMD works fully offline. It makes a network request only when **you** ask it to:

- **Link cards** fetch a page's preview metadata (title/description/image) — only when you insert or
  refresh a card, never automatically on load. The fetched values are cached in your file so the
  card renders offline afterward.
- **GitHub integration** (contributors for `@mentions`, issues for `#references`) uses VS Code's
  built-in GitHub sign-in and is **opt-in** via **OMD: Connect GitHub**; on open it only uses an
  existing session and never prompts.

OMD collects **no telemetry**.

## Contributing

All documentation lives under [`docs/`](docs/) — start at [`docs/README.md`](docs/README.md) for the
map. In short: the design corpus (why OMD is shaped the way it is) is in
[`docs/design/`](docs/design/); build/test/round-trip notes are in
[`CONTRIBUTING.md`](CONTRIBUTING.md); release and operational runbooks are in
[`docs/operations/`](docs/operations/).

Please file issues in the repo.

## AI Disclosure

OMD was developed almost entirely using Claude Code.  The repo contains agent-oriented documents to help guide Claude. As the maintainer of OMD, I understand that the use of AI to build software offends some.  There are likely other ways to edit markdown files that are more aligned to those worldviews.

## License

[MIT](LICENSE). Bundled third-party code is listed in
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).
