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
  plain markdown reader still understands, and the set is open — see
  [Writing your own blocks](#writing-your-own-blocks).
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

1. Download the `.vsix` from the [latest release](https://github.com/pbleisch/omd/releases/latest)
   and install it with `code --install-extension omd-<version>.vsix`.
2. Open a `.md` file and run **OMD: Open in OMD editor**. Installing OMD does not change which
   editor opens markdown, so this is how you see it — try it on a file you know.
3. Press `/` in the document for the block menu, or use the toolbar.
4. Like it? Run **OMD: Make OMD the default Markdown editor** and `.md` files open in OMD from then
   on. **OMD: Restore the built-in Markdown editor** undoes that at any time, and
   **OMD: Reopen as plain text** drops a single file back to plain text without changing the default.

New to it? Open the bundled **`showcase/`** wiki in the source repo — it exercises every feature.

## Writing your own blocks

The block list isn't fixed. OMD discovers blocks from `<workspace>/.omd/blocks/` and
`~/.omd/blocks/` when it opens a document, so adding one is adding a directory — no fork, no
rebuild, no patched extension.

The smallest real block is a single file. `.omd/blocks/badge/block.json`:

```json
{
  "name": "badge",
  "title": "Badge",
  "kind": "leaf",
  "icon": "tag",
  "group": "Inline",
  "defaultParams": { "label": "new", "color": "#3fb950" },
  "params": [
    { "name": "label", "label": "Label", "type": "string", "required": true },
    { "name": "color", "label": "Color", "type": "color" }
  ],
  "template": "<span style=\"padding:1px 8px;border-radius:999px;color:#fff;background:{{color}}\">{{label}}</span>"
}
```

Reopen the `.md` file and **Badge** is in the `/` menu, with Label and Color editable in the
property panel. On disk it's one HTML comment — `<!-- omd:badge {"label":"new","color":"#3fb950"} -->`
— so the file is still plain markdown and still round-trips byte-for-byte.

Blocks run in one of two tiers, and which one you get is decided at parse time, not by trust. A
`template` block renders an eval-free Handlebars subset with escaped, sanitized output and executes
no code. Adding a `render.js` beside the manifest gets you a `sandboxed` block: your code runs in an
opaque-origin iframe with no network and no reach into the editor's DOM, cookies, or storage. A block
OMD didn't ship never runs with the editor's privileges.

Two things worth knowing before you start. A custom block's shortcode is an HTML comment, so a
reader **on GitHub sees an empty spot** unless the block also emits a plain-GFM coexistence form
(how the built-ins do it: [`docs/design/FORMATS.md`](docs/design/FORMATS.md)). And discovery runs per
document — reopen the file after you add or edit a block.

Full manifest reference, both tiers, and two copy-start examples:
[`docs/contributing/AUTHORING-SMART-BLOCKS.md`](docs/contributing/AUTHORING-SMART-BLOCKS.md) and
[`examples/blocks/`](examples/blocks/). From a clone, `npm run new:block -- my-block` scaffolds one.

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
