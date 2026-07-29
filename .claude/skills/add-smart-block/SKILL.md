---
name: add-smart-block
description: Add or create an OMD smart block (a slash-menu block / editor plugin) — scaffold it, implement a render tier, and verify it round-trips. Use when the user asks to add, create, or author a smart block, a custom block, or a block plugin in OMD.
---

# Add a smart block to OMD

A smart block is a rich editor object that serializes to plain, round-trip-safe markdown. Follow this
workflow; it keeps a new block inside OMD's guarantees instead of around them.

## 0. Read the contract first

- [`docs/design/SMART-BLOCKS.md`](../../../docs/design/SMART-BLOCKS.md) — the model (leaf vs container, native vs managed, the three trust tiers).
- [`docs/design/FORMATS.md`](../../../docs/design/FORMATS.md) — the exact on-disk bytes a block serializes to.
- [`docs/contributing/AUTHORING-SMART-BLOCKS.md`](../../../docs/contributing/AUTHORING-SMART-BLOCKS.md) — the how-to and the full `block.json` reference.

Decide two things: **kind** (`leaf` = one tag; `container` = wraps an editable markdown body) and,
for a leaf, **tier** (`template` = safe eval-free substitution; `sandboxed` = author `render.js` in an
isolated iframe, no network/no page access). The template/sandboxed tiers apply to **leaf** blocks;
a container renders as chrome over its markdown body.

## Which path?

- **A — a discovered block** (the common case): a block that lives in a workspace or a user's home
  directory (`.omd/blocks/<name>/`), added without touching OMD's source. Do this unless the user
  explicitly wants the block built into OMD.
- **B — a shipped built-in**: a block added to OMD's own set (`SHIPPED_BLOCKS`), which can carry a
  trusted in-editor renderer. Only shipped blocks may be `builtin`-trust.

---

## Path A — a discovered block

1. **Scaffold** it (writes a valid `block.json`, plus `render.js` for the sandboxed tier):
   ```bash
   npm run new:block -- <name> --kind <leaf|container> --tier <template|sandboxed>
   #   --title "…"  --group "…"  --icon <codicon>  --out <dir>  --user  --force
   ```
   `<name>` is lowercase / digits / dashes. Default target is `<workspace>/.omd/blocks/<name>/`.

2. **Implement** the block:
   - `template` tier → edit the `template` in `block.json`. Only `{{path}}` (escaped), `{{{path}}}`
     (raw), and `{{#if}}`/`{{#unless}}`/`{{#each}}` are supported; output is HTML-escaped and
     sanitized. Style inline (no separate CSS is loaded for discovered blocks).
   - `sandboxed` tier → edit `render.js`. Only `params` and `root` are in scope. Build DOM under
     `root`; never assemble untrusted strings as HTML; no network is available.
   - Declare editable fields in `params[]` (`string|number|boolean|enum|color|date`); mark
     insert-time-required ones `required: true`.

3. **Verify the round-trip** (the non-negotiable gate). Launch an Extension Development Host
   (**F5** → *Run OMD Extension*), open a `.md`, insert the block via `/`, then **save with no
   further edit** — the file must come back byte-for-byte. The preview harness cannot reproduce this;
   use the real host.

4. **Read the principles back** with the block open ([`docs/design/PRINCIPLES.md`](../../../docs/design/PRINCIPLES.md)):
   it must look finished, use a codicon (never emoji) for chrome, and be theme-aware.

5. If you added the block to `examples/blocks/` (a repo example), run `npm test` and `npm run lint` —
   `test/examples-blocks.test.ts` validates every example manifest.

---

## Path B — a shipped built-in

1. Add the definition to `SHIPPED_BLOCKS` in `src/shared/blocks.ts` (`source` is stamped
   automatically; only shipped defs may set `trust: 'builtin'`).
2. Give it a renderer:
   - trivial output → a `template`, or
   - rich/interactive output → a trusted renderer (leaf: add to `BUILTIN_RENDERERS` in
     `src/webview/blocks/render.ts`; container/interactive: a NodeView under
     `src/webview/plugins/shortcode/`).
3. If it has a GitHub-visible form, implement the coexistence serialization per
   [`docs/design/FORMATS.md`](../../../docs/design/FORMATS.md) and the export path in `src/shared/omd-blocks.ts`.
4. **Add a byte-for-byte round-trip test** (see `test/*.test.ts` and `src/shared/roundtrip.ts`) — this
   is how Principle 2 is enforced. Then `npm test`, `npm run lint`, `npm run typecheck`.
5. Add a `CHANGELOG.md` entry under `[Unreleased]`.

---

## Definition of done (both paths)

The round-trip holds byte-for-byte; the block reads as finished; chrome is codicons and theme
variables; nothing runs with privileges it shouldn't (discovered author code is forced to the sandbox
at parse time). A green test alone is not done — open the editor and use it.
