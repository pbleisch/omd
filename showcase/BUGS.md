# OMD — bugs & enhancements

The living backlog. Done items are pruned; what's here is open work.

## Orientation (start here)

New here? For the design, read `../docs/design/` (VISION → PRINCIPLES → ARCHITECTURE → SMART-BLOCKS →
FORMATS → STYLE). For build/run and architecture, read `../README.md` and `../CONTRIBUTING.md`.
What's **done** is not listed below (open work only) — `CONTRIBUTING.md`, the docs, and `git log`
are the record.

Build & test:

- `npm run build` — esbuild bundles the **host** (→ `dist/extension.js`, the extension's `main`), the
  **webview** (→ `media/webview.js`), and the **GitHub-preview panel** (→ `media/panel.js`), all
  minified. `build:host` (tsc → `out/`) is a typecheck + the build the integration tests run against;
  the running extension loads the `dist/` bundle, so a `src/**` change needs a rebuild and a **Reload
  Window** in the Extension Development Host to take effect.
- `npm test` — vitest/jsdom unit + round-trip tests (~530). `npm run lint` — eslint (flat config).
- `npm run test:integration` — host-only behaviour in a **real** VS Code (`@vscode/test-electron`):
  backlinks, the broken-link filesystem check, save-as, open/external-reload. The webview DOM isn't
  reachable from it.
- `test/preview/index.html?doc=<path>` — the webview in a plain browser for quick visual iteration.
  It **can't** reproduce real pointer drags or native text selection — verify those in the host.

## Open bugs

- [ ] **Blockquote nesting adds a blank line on round-trip (minor).** A list or nested blockquote
  directly under a `>` line gains a blank `>` line: `> [!NOTE]\n> - x` → `> [!NOTE]\n>\n> - x`, and
  `> outer\n> > inner` → `> outer\n>\n> > inner`. **Content is preserved** — remark just normalizes
  blockquote children with a blank separator. Low priority (renders identically on GitHub).
  *Not fixable via a serialize-fixup:* `> a\n>\n> b` (an **intended** blank between paragraphs)
  round-trips exactly and must be kept, but the output alone can't distinguish that from the blank
  remark **adds** before a list/nested quote — so a string fixup would either miss the drift or
  corrupt intentional spacing. The real fix is in remark-stringify's blockquote join/tightness logic
  (the same family as the `tight-lists` `spread` fix), which is deeper. Deferred.

## Enhancements

- [x] **Diagnostics polish** — *done.* The document-issues chip (`ui/problems-chip.ts`) now shows a
  one-click **Fix** button on problems that carry a suggestion (bad-anchor → nearest heading;
  re-points the link mark), and **F8 / Shift+F8** step to the next/previous problem (scroll + flash)
  while the editor is focused. *(F8 handling in the real VS Code webview wants a smoke-test — VS Code
  may claim the key; the chip list is the fallback.)*

## Media

> A first pass at the media picker + drag-and-drop lives on the **`media-picker`** branch (deferred
> for design review): a modal media browser (drop zone / URL / workspace thumbnail grid), external
> file→copy and URL→block drag-and-drop, gallery drop-to-add, with the copy-vs-reference rule and
> host file I/O. Revisit and merge (or rework) from there; the items below are the original spec.

- [ ] **Media picker.** A consistent picker used everywhere media is added: choose an image from
  the workspace (relative path), enter a URL, or drag-and-drop a file (copied into the workspace and
  linked). URLs are referenced, not copied. Integrates with document drag-and-drop (below): a dropped
  URL becomes the right smart block referencing it, a dropped file is copied then linked — so the two
  features share one code path.

- [ ] **Gallery drop-to-add.** Drop image files/URLs onto the gallery to append items. Deferred to
  the drag-and-drop item below (file drops need the "copy into workspace vs. reference" decision).
  Explicit add (URL) + per-item remove already work.

- [ ] **Drag-and-drop from outside VS Code.** Dropping files / images / URLs / rich text onto an OMD
  view should show a drop-position indicator and preview the block smart-paste will create. Decide
  per payload: image files (copy into the workspace vs. reference), URLs (link card / youtube /
  embed), HTML/rich text (smart-paste to markdown). Builds on smart-paste + the block-drag machinery,
  and shares the copy-vs-reference logic with the media picker.

## GitHub & wiki workflows

- [ ] **GitHub preview fidelity — remaining.** The shared renderer (`shared/github-render.ts`) feeds
  both a live "render like GitHub" panel (`OMD: Open GitHub Preview`, `host/githubPreview.ts` +
  `src/panel/`) and the OMD-view HTML export (`shared/omd-blocks.ts`); both are in place. Open:

  - [x] **Mermaid in the *static* export** — *done.* When a document has a diagram, the mermaid
    runtime (`media/mermaid.min.js`, copied from the package at build) is inlined into the exported
    file with an init script, so it renders diagrams **offline** (no browser engine needed host-side,
    no runtime for non-mermaid exports). *(Also fixed a latent bug: github-markdown-css was read from
    `node_modules` via `require.resolve`, which fails in the packaged `.vsix`; both the CSS and
    mermaid now ship in `media/` and are read from the extension dir.)*
  - [x] **Alert title case** — *done.* The renderer post-processes the alert label to title case
    (`Warning`, not `WARNING`), scoped so a literal "WARNING" in prose is untouched.
  - [x] **Follow the active editor** — *done.* The provider fires `onDidChangeActiveDocument` (from
    each editor's `onDidChangeViewState`), and the preview panel retargets to it, so it follows as you
    switch OMD documents (`host/editorProvider.ts`, `host/githubPreview.ts`).
  - [ ] **Scroll sync** — still unimplemented. Harder: needs a source-line ↔ rendered-position map
    between the ProseMirror editor and the remark-rendered preview (no shared coordinate today).

  **Known GFM fidelity gaps vs github.com.** The renderer is an independent, spec-compliant *mimic*
  (`remark` + `remark-gfm`), **not** GitHub's `cmark-gfm` engine; spec GFM matches structurally, but
  GitHub's app-level extras are approximated per feature. Byte-identical output would need GitHub's
  `POST /markdown` API (network + repo context) — a possible future "verify against GitHub" mode.
  Remaining:

  - [x] **Heading anchors** — *done.* GitHub-style de-duplicated `id` on every heading
    (`shared/github-render.ts` `headingAnchors`), enabling in-page `#anchor` links and TOC targets.
    *(The hover anchor-link icon GitHub adds is cosmetic and still omitted.)*
  - [x] **Emoji shortcodes** — *done.* `:tada:` → 🎉 in the renderer via `remark-gemoji` (full GitHub
    set). In the editor the `:` autocomplete (debounced, 1-char trigger) inserts the **`:name:`
    shortcode**, which is **kept on disk** (GitHub-source form) and rendered as the emoji glyph by a
    decoration (`plugins/emoji-decoration.ts`, reveal-on-cursor for editing); a serialize-fixup keeps
    underscores in shortcodes (`:white_check_mark:`) byte-for-byte.
  - [x] **Wikilinks in the preview** — *done.* `[[Page]]` / `[[label|target]]` → real links,
    case-preserving space→dash href (GitHub-Wiki style), skipping code (`shared/github-render.ts`
    `wikilinks`).
  - [x] **Bare `@mention` / `#123` autolinking** — *done.* In a GitHub repo context (`owner/repo`
    from the git remote, threaded into the renderer), bare `@name` → the profile and `#123` → the
    repo issue, in both the preview and export. Word-boundary-guarded (skips emails, inline code) and
    disabled without a repo, matching GitHub (`shared/github-render.ts` `mentionsAndIssues`).
  - [ ] **HTML sanitization (preview parity)** — *won't-do, by design.* GitHub sanitizes against an
    allowlist; the preview renders `sanitize: false` (needed for the coexistence forms) and is already
    safe under the webview's strict nonce CSP (an injected `<script>` can't run). No user-visible
    difference; adding a sanitizer here would only risk breaking the coexistence forms. (The
    **export**, which has no CSP, *is* sanitized — threat-model R1.)
  - [ ] **Syntax-highlighting engine** — *won't-do (low value).* Shiki (VS Code's TextMate grammars +
    GitHub themes) vs GitHub's tree-sitter: visually near-identical, occasional token differences.
    Matching GitHub exactly would mean swapping the highlighter for imperceptible gain.

- [ ] **Be a great editor inside a GH Wiki workspace.** (The wiki clone/preview/publish *workflow*
  is a separate extension — OMD's job is to edit the `.md` files well when the workspace *is* a cloned
  wiki.) Mostly working now: `[[Page Name]]` resolves to the right sibling `.md` including the GitHub
  **space ↔ dash** mapping and now **case-insensitively** (`host/wikiResolve.ts` — a flat-wiki sibling
  scan, so `[[page name]]` finds `Page-Name.md` on a case-sensitive filesystem); backlinks work across
  the flat page set (incl. regular links); and `_Sidebar.md` / `_Footer.md` edit cleanly.
  - *Done:* case-insensitive click-through (`host/wikiResolve.ts`, real-host tested); the wiki
    fixture gained `_Sidebar.md` / `_Footer.md` / a case-mismatch page with integration coverage.
  - [ ] **Sidebar/footer placement** — GitHub shows `_Sidebar` on the right and `_Footer` at the
    bottom; OMD still renders them as ordinary pages. Special placement (detect a wiki workspace,
    surface the sidebar/footer around the edited page) is a real feature, not yet built.

## Other workflows

- [ ] **Hugo / Jekyll / MADR docs.** Document front-matter handling and how OMD's shortcodes and
  coexistence forms behave in each pipeline — including any collision between OMD's `<!-- omd:… -->`
  shortcodes and Hugo's `{{< … >}}` shortcodes, and how front matter round-trips.

## Release readiness

The mechanical work is **done** (bundled + minified host/webview/panel, manifest metadata + 128px
icon, `.vscodeignore`, `LICENSE`, `THIRD-PARTY-NOTICES.md`, user-facing `README` + `CONTRIBUTING` +
`CHANGELOG` + `SECURITY`, GitHub Actions CI + tag-driven release workflow, ESLint, `docs/operations/THREAT-MODEL`
and `docs/operations/PERFORMANCE`). Playbook: [`docs/operations/RELEASING.md`](../docs/operations/RELEASING.md). Remaining:

- [ ] **Human-only account steps** (see `docs/operations/RELEASING.md`): create the public GitHub repo, register
  a Marketplace publisher and set `publisher` to its id (currently `pbleisch`), add the `VSCE_PAT` CI
  secret. Update `repository`/`bugs`/`homepage`/`SECURITY.md` URLs if the repo isn't `pbleisch/omd`.
- [ ] **`npm audit`** — advisories at last check were all in **dev/build** tooling (vsce, eslint
  transitive), none in shipped runtime deps. Confirm per release; fix any that reach shipped deps.
- [ ] **Smoke-test the `.vsix`** in a clean VS Code before the first publish (packaging is verified;
  the actual install-and-open check is the one thing not automatable here).
- [x] **Threat-model follow-ups** (`docs/operations/THREAT-MODEL.md` R1/R2) — **done.** HTML export output is
  sanitized (`src/host/sanitize-html.ts` — denylist strip of scripts/handlers/script-URLs, preserving
  the injected SVG/highlighting/wrappers); the link-card fetch has SSRF guards (`src/host/ssrf.ts` —
  reject private/link-local hosts, per-redirect-hop). *(The preview's HTML-sanitization fidelity gap
  above is separate — the preview is CSP-protected and intentionally unsanitized.)*
- [ ] **Performance follow-ups** (`docs/operations/PERFORMANCE.md`): lazy-load the heavy webview libraries
  (mermaid/chart.js/shiki ≈ 7 MB loaded eagerly today) and `mathjax-full` in the host export path;
  establish the runtime baselines. *(Bundle-architecture change — esbuild code-splitting + a webview
  CSP tweak to allow chunk loading — that needs real-host verification; not started.)*

## Known limitations

- **Escaped literal `\[\[` isn't preserved.** The serialize fixup unescapes `[[…]]` → `[[…]]` (so
  wikilinks survive edits, and backlinks keep working). Consequence: you can't keep an
  *intentionally* escaped literal `[[text]]` — it always becomes a real wikilink. Accepted tradeoff.

