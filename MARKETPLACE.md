# OMD — Edit documents, not markup

**A WYSIWYG editor for `.md` files that never takes your markdown hostage.**

OMD renders markdown as a finished document — callouts, tables, task lists, code, diagrams, charts,
comments — and edits it that way. The file on disk stays plain, GitHub-renderable markdown.

![A single document in OMD — a GitHub alert callout, a Mermaid diagram, a table, a task list and syntax-highlighted code, all rendered and editable in place](https://raw.githubusercontent.com/pbleisch/omd/main/docs/images/hero.png)

*One page, top to bottom: every construct above is plain GFM on disk, and every one of them is
edited directly in the document.*

Open a file, save it without editing, and it comes back **byte-for-byte**. OMD is a rich *view* over
your markdown, never a separate format converted at save.

That means nothing about your file must become proprietary, diffs stay clean, and the document renders
the same on GitHub as it does here. Every construct OMD writes is plain GFM that other tools —
and other people — can read.

![The same file side by side — OMD's rendered view on the left, the plain GFM source on the right](https://raw.githubusercontent.com/pbleisch/omd/main/docs/images/roundtrip.png)

*Same file, same moment. On the right is exactly what's on disk — `> [!WARNING]`, a fenced
`mermaid` block, a pipe table, `- [x]` task items.*

## What you get

- **Rich rendering of plain GFM** — GitHub alert callouts, task-list checkboxes,
  syntax-highlighted code, Mermaid diagrams, and KaTeX math, all edited inline.
- **Smart blocks** — insert with `/`: callouts, collapsible sections, tabs, columns, an interactive
  chart backed by a real data table, YouTube embeds, image galleries, a live table of contents,
  dates, footnotes, and link cards with rich URL previews. Each serializes to a form a plain
  markdown reader still understands.
- **Spreadsheet-style tables** — overlay controls, move and sort columns and rows, keyboard
  navigation, and high-fidelity copy/paste to and from Excel, Sheets, and Word.
- **Comments** — thread a comment on any selection. Comments live *in the file* and survive every
  round-trip, so they travel with the document in Git.
- **References & backlinks** — `[[wikilinks]]`, `@mentions`, and `#issues` render as real links,
  with backlinks across the workspace in the sidebar.
- **Export** — one-click self-contained HTML; print to PDF from there.
- **Wiki-aware** — edits a cloned GitHub Wiki's flat page set correctly, including the space↔dash
  page-name mapping.

### Insert a block with `/`

![Typing slash opens the block menu, filtering to Three columns as you type, which inserts a live three-column block](https://raw.githubusercontent.com/pbleisch/omd/main/docs/images/slash-menu.gif)

Type `/`, keep typing to filter, and the block lands in the document ready to edit — here, a
three-column layout that a plain markdown reader still understands.

### Tables you can actually edit

![Dragging a table column to reorder it, then sorting rows by a column](https://raw.githubusercontent.com/pbleisch/omd/main/docs/images/tables.gif)

Hover any table for overlay controls: drag a column or row to reorder it, sort by a column, insert
and remove. The file on disk stays a plain GFM pipe table throughout.

## Getting started

1. Open any `.md` file and run **OMD: Open in OMD editor**. OMD opens markdown as a document when
   you ask it to — installing it leaves your editor exactly as it was.
2. Press `/` in the document for the block menu, or use the toolbar.
3. Want it every time? **OMD: Make OMD the default Markdown editor** — and
   **OMD: Restore the built-in Markdown editor** hands markdown straight back whenever you like.
   For a single file, **OMD: Reopen as plain text** drops to plain text without changing anything else.

Starting fresh, run **OMD: New document from template…** for a document that already exercises the
main constructs.

### Commands

| Command                                         | What it does                                     |
| ----------------------------------------------- | ------------------------------------------------ |
| **OMD: Open in OMD editor**                     | Open the current file in OMD.                    |
| **OMD: Reopen as plain text**                   | Drop back to VS Code's plain text editor.        |
| **OMD: Make OMD the default Markdown editor**   | Open `.md` files in OMD from now on.             |
| **OMD: Restore the built-in Markdown editor**   | Hand markdown back to VS Code's built-in editor. |
| **OMD: New document from template…**            | Create a document from a template.               |
| **OMD: Export to HTML…**                        | Export a self-contained HTML file.               |
| **OMD: Open GitHub Preview**                    | Live side-by-side "render like GitHub" view.     |
| **OMD: Connect GitHub (contributors & issues)** | Opt in to `@mention` and `#issue` resolution.    |

## Requirements

VS Code **1.90** or newer. Nothing else is required — OMD works fully offline out of the box.

The optional AI features additionally need a chat-model provider installed and signed in (such as
GitHub Copilot). They are **off by default**; see below.

## Privacy & network use

OMD works fully offline. It makes a network request only when **you** ask it to:

- **Link cards** fetch a page's preview metadata (title, description, image) — only when you insert
  or refresh a card, never automatically on load. The fetched values are cached in your file, so the
  card renders offline afterward.
- **GitHub integration** (contributors for `@mentions`, issues for `#references`) uses VS Code's
  built-in GitHub sign-in and is **opt-in** via **OMD: Connect GitHub**. On open it only uses an
  existing session and never prompts.
- **AI features** are **off by default** (`omd.ai.enabled`). With the setting off, OMD never contacts
  a language model. When enabled, the extension host — never the editor view — makes the call
  through VS Code's language-model API, only on an explicit action, never on load.

OMD collects **no telemetry**.

## Feedback

Bug reports and feedback are very much appreciated — please file issues on the
[project repository](https://github.com/pbleisch/omd/issues).

## License

[MIT](https://github.com/pbleisch/omd/blob/HEAD/LICENSE). Bundled third-party code is listed in
[THIRD-PARTY-NOTICES.md](https://github.com/pbleisch/omd/blob/HEAD/THIRD-PARTY-NOTICES.md).
