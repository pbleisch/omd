# OMD — Architecture

This describes *how OMD is shaped and why*, not a file layout to reproduce. Treat the
component names, libraries, and boundaries here as strong defaults that have earned their
place — but the contract you must honor is the behavior in [`PRINCIPLES.md`](PRINCIPLES.md)
and the on-disk formats in [`FORMATS.md`](FORMATS.md), not any particular module structure.

## The core idea

OMD is a **custom editor** for `.md` files: a WYSIWYG surface that edits the *rendered* document
while persisting *plain GFM*. The document model is markdown the whole way through — the editor is a
rich view over markdown, never a separate format that gets converted at the door.

It is registered at `priority: "option"`, so it sits *beside* VS Code's text editor rather than
displacing it — installing OMD changes nothing about which editor opens markdown. See
[`DECISIONS.md`](DECISIONS.md) for why, and how the opt-in works.

## Two processes

VS Code's custom-editor model splits the extension into two halves that talk only by
message passing. Keep this split; it's what isolates the rich UI from the editor and keeps
the file authority on the host side.

**Host (Node.js).** Owns the file and everything that needs the filesystem, the network, or
VS Code APIs:

- Reading and writing the `.md` document; it is the single source of truth on disk.
- **Comments** — thread metadata is held here and serialized into the file, so the editor
  can't destroy it during a round-trip (see [`FORMATS.md`](FORMATS.md)).
- **Block discovery** — finds smart-block definitions across the workspace, the user's home
  directory, and the ones OMD ships, and sends the resolved set to the editor.
- **GitHub integration** — repo info, contributors (for `@mentions`), issues (for
  `#references`), and wiki preview, via VS Code's authentication.
- **Diagnostics** — validates the markdown (broken links, bad anchors, malformed front
  matter, unclosed HTML) and offers quick fixes in the Problems panel.
- **Export** — HTML and PDF.
- **Templates** — new-document scaffolds, discovered the same three-layer way as blocks.

**Editor / webview (sandboxed browser).** Owns the writing experience:

- A rich-text editor over the markdown document.
- A set of **plugins**, each adding one capability — a callout style, collapsible sections,
  columns, code highlighting, a slash menu, comments, the smart-block runtime.
- The **smart-block runtime** — parses shortcodes, renders block output, and manages block
  editing (see [`SMART-BLOCKS.md`](SMART-BLOCKS.md)).
- **Smart paste** — turns pasted URLs into embeds, HTML into GFM, spreadsheet cells into
  tables.
- The **toolbar** and **side panels** (document outline, comment threads, backlinks).

## The editor engine

Build the surface on **Milkdown** (a wrapper over **ProseMirror**) with CommonMark + GFM
presets. This is the recommended default: ProseMirror gives a real document model and
NodeView/decoration primitives that the whole plugin system leans on. If you choose
differently, the burden is to match the same round-trip fidelity and inline-rich editing —
that's why this stack is the default, not incidental taste.

Plugins tend to fall into three patterns, worth naming because most features are one of them:

- **NodeView** — take over rendering of a node entirely with custom DOM. For blocks that
  need rich, interactive UI: diagrams, block math, smart blocks.
- **Decoration** — overlay styling or widgets on existing nodes without changing the
  document: callouts, collapsible sections, columns, dates, comment highlights.
- **Keymap / input** — watch for keys or text patterns to trigger behavior: the slash menu,
  shortcuts, autocomplete.

## Keeping the two sides in sync

Edits flow editor → host (serialize to markdown, debounced) and file changes flow host →
editor (re-render). The one hazard to design around: a naive loop where a save triggers a
re-render that emits an edit that triggers another save. Guard against it with a small set of
suppression flags and whitespace-normalized comparison, so identical content doesn't re-fire.
However you build it, **the sync must not loop and must not lose the round-trip** — that's the
actual requirement; the flags are one way to meet it.

## AI is a host capability, additively

The only AI surface is the `ai` smart block, and it fits the two-process shape without bending it:
the **host** owns every model call (`vscode.lm`), because the webview is a sandboxed, network-less
iframe that can't reach a model. A block Run is *intent* the editor sends over the message boundary
(`runPrompt`); the host does the call, gated behind `omd.ai.enabled`, and streams the answer back
(`promptChunk`/`promptDone`/`promptError`) — the same request/reply shape as `linkcard`'s host-side
fetch. Nothing runs on load, and the result is cached as GFM in the block body so the round-trip
holds. It's an additive layer, not a dependency: with AI off, the architecture is unchanged. See
[`DECISIONS.md`](DECISIONS.md) and [`SMART-BLOCKS.md`](SMART-BLOCKS.md).

## For the tech choices and the reasoning behind them

See [`DECISIONS.md`](DECISIONS.md) — the short list of choices worth carrying over (custom
editor as a webview, markdown as the model, CSS-as-text, three-layer discovery) and how AI
returned as one additive, opt-in block.
