# Authoring smart blocks

How to add a smart block by dropping files into a directory — no rebuild, no fork. This is the
*how-to*; the *why* is [`../design/SMART-BLOCKS.md`](../design/SMART-BLOCKS.md) and the exact on-disk
bytes are in [`../design/FORMATS.md`](../design/FORMATS.md). Two copy-start examples live in
[`../../examples/blocks/`](../../examples/blocks/).

> This layer is a **convenience, not law** — the design corpus fixes OMD's essence; this guide is one
> supported path for extending it. If you're changing OMD's core rather than adding a block, start
> from [`../../AGENTS.md`](../../AGENTS.md).

## Where a block lives

A block is a directory containing a `block.json` manifest, discovered from three layers (first match
wins by `name`):

| Layer | Path | Scope |
|---|---|---|
| Workspace | `<workspace>/.omd/blocks/<name>/` | Checked into the repo, shared with the team. |
| User | `~/.omd/blocks/<name>/` | Personal, available in every workspace. |
| Shipped | (built into OMD) | The defaults. |

A workspace block shadows a user block shadows a shipped one. Discovery runs **per document**, so
reopen the `.md` file after adding or editing a block.

## Quickstart

Scaffold a new block (writes a valid `block.json`, plus `render.js` for the sandboxed tier):

```bash
npm run new:block -- my-block                       # leaf, template tier, into .omd/blocks/
npm run new:block -- my-block --tier sandboxed      # leaf with a render.js
npm run new:block -- my-block --kind container      # wraps an editable markdown body
#   also: --title "…"  --group "…"  --icon <codicon>  --out <dir>  --user  --force
```

Or copy a worked example to start from:

```bash
mkdir -p .omd/blocks && cp -r examples/blocks/badge .omd/blocks/
```

Either way, edit the files and re-open the `.md` document (discovery runs per document) to see the
block in the slash menu under its `group`.

## The manifest (`block.json`)

Every field the parser reads (`src/shared/blocks.ts`, `parseBlockManifest`). Unknown fields are
ignored; a manifest that fails a **required** rule is skipped with a log line, never crashing
discovery.

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | **yes** | The shortcode identity — `<!-- omd:<name> … -->`. Must match `^[a-z0-9][a-z0-9-]*$` (lowercase, digits, dashes; may start with a digit). |
| `kind` | `"leaf"` \| `"container"` | **yes** | Leaf = a single tag. Container = wraps a real-markdown body between open/close tags. Anything else is rejected. |
| `title` | string | no | Human label for the slash menu and block header. Defaults to `name`. |
| `icon` | string | no | A [codicon](https://microsoft.github.io/vscode-codicons/dist/codicon.html) name (e.g. `tag`, `dashboard`). Chrome is codicons, **never emoji**. |
| `group` | string | no | Slash-menu group heading (e.g. `Inline`, `Media`, `Structure`, `Rich`). |
| `keywords` | string[] | no | Extra slash-menu search terms. |
| `defaultParams` | object | no | Params written into the shortcode on insert. Present even when `{}`. |
| `params` | ParamDef[] | no | Typed, editable parameters shown in the property panel (see below). |
| `template` | string | no | Template-tier output source (see *Render tiers*). |
| `trust` | `"template"` \| `"sandboxed"` | no | Defaults to `template`. A discovered block can **never** be `builtin`, and any block with a `render.js` is forced to `sandboxed` — whatever the manifest says. |

A `render.js` file beside the manifest becomes the block's sandboxed author code (`script`). Its
presence forces the `sandboxed` tier.

### ParamDef

Each entry in `params` drives one row in the property panel. Field renderers map 1:1 to `type`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | **yes** | Key under which the value is stored in the shortcode params. |
| `type` | `string` \| `number` \| `boolean` \| `enum` \| `color` \| `date` | **yes** | Picks the editing control. Unknown types drop the entry. |
| `label` | string | no | Human label; falls back to `name`. |
| `default` | any | no | Seed value when stored params don't carry one. |
| `options` | string[] | no | Choices for an `enum`. |
| `required` | boolean | no | Must be filled before insert (collected via a prompt). |

## Render tiers

A block you author runs in one of two tiers. Code you didn't ship never runs with the editor's
privileges — that rule is enforced at parse time, not by convention.

### `template` — safe, no code runs

An eval-free subset of Handlebars (`src/webview/blocks/template.ts`) rendered against the block's
**params**. Interpolated values are HTML-escaped and the output is sanitized (script/style/iframe/
object/embed/link/meta/base elements and `on*` / `javascript:` attributes are stripped), so a
template can't execute anything even outside the webview CSP.

Supported syntax:

- `{{path}}` — HTML-escaped interpolation. `path` is a dotted lookup into params.
- `{{{path}}}` — raw (unescaped) interpolation. Use only for values you control.
- `{{#if path}}…{{/if}}`, `{{#unless path}}…{{/unless}}`
- `{{#each path}}…{{/each}}` — `{{this}}` is the current item; object items also expose their keys.

Inline `style` attributes are allowed (the webview CSP permits `'unsafe-inline'` styles), so style
your output inline — see [`../../examples/blocks/badge/block.json`](../../examples/blocks/badge/block.json).
There is no separate CSS file for a discovered block.

### `sandboxed` — author code, isolated

Put a `render.js` beside the manifest. Its body runs in an iframe that is `sandbox="allow-scripts"`
**without** `allow-same-origin` (a unique opaque origin) under its own `default-src 'none'` CSP —
**no network, no access to the editor's DOM, cookies, or storage** (`src/webview/blocks/sandbox.ts`).

Your code runs as a function body with exactly two names in scope:

- `params` — the block's parameters object.
- `root` — the element to render into.

Build DOM under `root`; don't assemble untrusted strings into `innerHTML`. Errors are caught and
shown in place. The frame self-sizes to its content. See
[`../../examples/blocks/metric/render.js`](../../examples/blocks/metric/render.js).

## Leaf vs container

- **Leaf** — a single tag: `<!-- omd:badge {"label":"new"} -->`. Its rendered output comes from your
  tier (template or `render.js`).
- **Container** — wraps a real-markdown body: `<!-- omd:name {…} -->` … `<!-- /omd:name -->`. The
  body stays real markdown nodes and round-trips as-is; containers are the right shape when the block
  frames author-written content.

Start with a leaf — both examples are leaves.

## What a reader on GitHub sees

A custom block serializes to an HTML comment, which renders as **nothing** on GitHub. That's safe
(the file is still valid markdown) but it means a plain reader sees an empty spot. Blocks that should
show real content on GitHub emit a plain-GFM *coexistence form* alongside the shortcode — that's an
advanced move; the built-ins that do it are described in [`../design/FORMATS.md`](../design/FORMATS.md).

## Before you call it done

- **It round-trips.** Open a doc containing your block and save with no edit — the file must come back
  byte-for-byte. This is [Principle 2](../design/PRINCIPLES.md); it is not optional.
- **Manifest is valid.** `examples/blocks` are checked by `test/examples-blocks.test.ts`; if you add
  an example, that test keeps it honest.
- **Chrome uses codicons, styling is theme-aware**, and the block reads as finished — re-read
  [`../design/PRINCIPLES.md`](../design/PRINCIPLES.md) with your block open.
