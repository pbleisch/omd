# OMD — Smart Blocks

Smart blocks are OMD's expression of the vision: a rich,
interactive object in the editor that serializes to markdown a plain renderer still shows
correctly. They are how OMD is "rich like Confluence" without breaking "portable like
markdown."

## What a smart block is

A self-contained, file-based extension to the editor: a small definition (metadata, an
optional output template, an optional render script, optional CSS) that OMD discovers and
offers in the slash menu and toolbar. In the editor it renders as real UI — a chart you can
edit, a YouTube thumbnail, a collapsible section. On disk it is GFM.

## How it lives on disk: the shortcode

A block serializes to an HTML comment that GitHub renders as nothing:

```html
<!-- omd:youtube {"url":"https://youtu.be/abc","title":"..."} -->
```

That comment carries the block's identity and parameters. **Leaf** blocks (a date, a video)
are a single tag. **Container** blocks (a callout, tabs, columns) wrap real markdown body
content between an open and close tag:

```html
<!-- omd:collapsible {"summary":"Details"} -->
Any **markdown** can live here.
<!-- /omd:collapsible -->
```

The crucial move: for most blocks the shortcode sits *alongside* an equivalent plain-GFM
rendering of the same content, so a reader on GitHub sees a real image, video thumbnail, or
blockquote — not an empty comment. The shortcode is the machinery OMD reads back; the GFM is
what everyone else sees. Exact byte layouts are in [`FORMATS.md`](FORMATS.md).

## Native patterns: blocks you didn't insert as blocks

Plenty of rich constructs already exist in bare GFM. A ` ```mermaid ` fence *is* a diagram;
`> [!NOTE]` *is* a callout; a `<details>` *is* a collapsible. OMD recognizes these native
forms and renders them richly without requiring a shortcode. A block is therefore in one of
two states:

- **Native** — present as bare GFM, edited inline. What a hand-writer or another tool wrote.
- **Managed** — wrapped in shortcode tags, so its parameters are stored as JSON and editable
  through the block's UI.

Editing a native block's parameters promotes it to managed; that's the only time OMD adds
machinery, and only because the user asked for structure the bare form can't hold.

## Safety: who gets to run code

Blocks render at three levels of trust:

- **Template only** — text substitution with escaping. No code runs. Most simple blocks.
- **Built-in script** — render code that OMD itself ships, trusted to run in the editor.
- **Sandboxed script** — user-authored render code, confined to a sandboxed frame with no
  network and no access to the surrounding page.

The rule: code you didn't ship never runs with the editor's privileges. See
[`DECISIONS.md`](DECISIONS.md).

## Where blocks come from: three layers

Blocks (and templates) are discovered from three sources, first match winning:

1. **Workspace** — checked into the repo, shared with the team.
2. **User** — personal, in the home directory.
3. **Shipped** — the built-ins OMD includes.

A workspace block shadows a personal one, which shadows a built-in of the same name. Only
shipped blocks are trusted as built-in; discovered ones follow the sandbox rule above.

## The built-in set (20)

Everything a writer needs out of the box, no configuration:

| Group     | Blocks                                           |
| --------- | ------------------------------------------------ |
| Callouts  | `note`, `tip`, `important`, `warning`, `caution` |
| Structure | `collapsible`, `tabs`, `2col`, `3col`            |
| Inline    | `date`, `footnote`, `toc`                        |
| Media     | `image`, `youtube`, `gallery`, `linkcard`        |
| Rich      | `mermaid`, `math`, `chart`, `ai`                 |

The `ai` block is the one AI surface, and a **built-in** by necessity: only shipped blocks may run
the host model call (`vscode.lm`) — a discovered or sandboxed block has no network. It carries an
embedded prompt in its params, runs it against a VS Code language model **only on an explicit
Run**, and caches the generated markdown in its body (so a GitHub reader sees the result and the
file round-trips). Its editor is a **Result/Prompt tab pair** (like the chart block): the generated
result shows by default, and the Prompt tab holds the prompt, the context scope, and a **model
picker** populated from the models actually installed (discovered host-side and pushed to the
editor). It is **off by default** (`omd.ai.enabled`) and never contacts a model on load. See
[`DECISIONS.md`](DECISIONS.md) for why it's the whole AI footprint, and [`FORMATS.md`](FORMATS.md)
for its on-disk bytes.

## Authoring your own

The file-based design means a team can add a block by dropping a definition into the
workspace's block directory — no rebuild, no fork. That extensibility is a feature, not an
afterthought: the built-ins and a user's own blocks use the same mechanism.

You don't have to write that definition by hand. Two on-ramps produce the same valid
`block.json` (and a `render.js` for the sandboxed tier) the host discovers:

- **The scaffolder** — `npm run new:block -- <name>` (`scripts/new-block.mjs`) writes a starter
  block into a discovery directory (`--kind`, `--tier`, `--user`, … to shape it).
- **The `add-smart-block` skill** (`.claude/skills/add-smart-block/`) — for coding agents: it
  scaffolds a block, implements a render tier, and verifies it round-trips.

The full `block.json` reference and the two author render tiers live in the how-to,
[`../contributing/AUTHORING-SMART-BLOCKS.md`](../contributing/AUTHORING-SMART-BLOCKS.md).
