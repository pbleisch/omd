# OMD Threat Model

A working threat model for OMD as a local VS Code extension. Scope is the shipped extension: the
extension host, the webview editor, the message channel between them, and the files/services they
touch. There is no OMD backend.

_Last reviewed: 2026-07 (v0.0.1)._

## Assets

- **The user's files** — the markdown OMD reads and writes. Integrity is paramount: an edit (or a
  no-op save) must never corrupt or silently rewrite content (Principle 2, the round-trip).
- **The workspace / filesystem** — OMD can create and write files (media imports, exports, new docs)
  within the workspace.
- **The user's machine and VS Code session** — code execution with the user's privileges.
- **Credentials** — the user's GitHub session (via VS Code auth) used for contributor/issue data.

## Trust boundaries

1. **Untrusted document → OMD.** A `.md` may come from anywhere (clone, download, teammate). Its
   text, embedded HTML, image URLs, link targets, and any smart-block shortcodes are untrusted input.
2. **Untrusted block definitions → editor.** Workspace/user block manifests and their `render.js`
   are untrusted code discovered from disk.
3. **Webview ↔ host.** The webview is a lower-trust rendering surface; the host holds file and OS
   privileges. They communicate only via the typed message union (`src/shared/messages.ts`).
4. **OMD → remote servers.** The host makes outbound requests (link-card metadata, GitHub API).

## Boundary-by-boundary analysis

### 1. Untrusted document content

- **Script injection via embedded HTML.** OMD's coexistence forms pass raw HTML through
  (`<div align>`, `<details>`, column `<table>`). In the **editor**, the webview CSP is the backstop:
  `default-src 'none'` with `script-src 'nonce-…'` means no inline or remote script in document
  content can execute — only OMD's own nonce'd bundle runs. In **HTML export**, output is produced by
  remark-html with `sanitize: false` (needed for the coexistence forms) and written to a file the
  user opens in a browser; that file is _not_ sandboxed, so the rendered fragment is passed through a
  denylist sanitizer (R1, mitigated below) that strips scripts/handlers/script-URLs before writing.
- **Malicious URLs.** Image `src` is confined by `img-src ${cspSource} https: data:` (no arbitrary
  schemes). Link/wikilink/mention targets are opened via the host, which only `openExternal`s
  `http(s)` and otherwise resolves workspace files — a `javascript:`/`file:` target is not followed.
- **Resource exhaustion / malformed input.** The parser and round-trip are pure and total; malformed
  YAML thread metadata is preserved in-body rather than dropped (never loses comments). Diagnostics
  are tuned for zero false positives and skip fenced code.

### 2. Untrusted block definitions (the trust tiers)

Three render tiers, enforced at parse time (`src/shared/blocks.ts`, `blocks/sandbox.ts`):

- **Built-in** (trusted, ships with OMD) — runs with editor privileges. Only `source: 'shipped'`
  definitions may claim this; the manifest parser downgrades anything else.
- **Template** — an eval-free string-substitution subset with escaped output, sanitized as
  defense-in-depth. No code runs. Chosen precisely because the webview CSP forbids `unsafe-eval`.
- **Sandboxed** — author `render.js` runs in a nested iframe that is `allow-scripts` **without**
  `allow-same-origin` (a unique opaque origin: no reach into the editor DOM, cookies, or storage) and
  carries its own `default-src 'none'` CSP (no network). `'unsafe-eval'` is granted only *inside*
  that jail. The parent trusts only `postMessage` whose `event.source` is that exact frame.
- **Enforcement:** any discovered (non-shipped) definition with a `script` is forced to `sandboxed`
  regardless of what its manifest claims, so a workspace block can never self-escalate.

### 3. Webview ↔ host channel

- The webview cannot read or write disk, spawn processes, or make cross-origin requests (CSP). Every
  privileged action is a **request to the host**, which validates and performs it. The host is the
  only writer to disk.
- **File writes are bounded to intent:** exports and new documents go through save dialogs; media
  import writes only into a `media/` folder beside the document under a sanitized, de-duplicated name.
  The document edit path replaces the open document's text only.
- **Message spoofing.** Messages are in-process VS Code webview messaging; there is no external
  origin to spoof. Request/response pairs (ping, link-meta, media) are correlated by nonce.

### 4. Outbound network

- **Link-card fetch** (`src/host/linkMeta.ts`) is the one host-initiated fetch of an arbitrary URL.
  Guards: `http(s)` only; **SSRF protection** (each hostname is DNS-resolved and rejected if any
  address is private/loopback/link-local/reserved, re-checked on every manually-followed redirect —
  R2, mitigated below); 8s abort timeout; HTML content-type check; 1 MB response byte cap; parsing is
  pure regex/string over `<head>` (no DOM, no code execution). It runs **only on explicit insert or
  refresh**, never on document load.
- **GitHub API** uses VS Code's built-in auth (opt-in, never prompts on open); OMD never handles raw
  tokens and requests only contributors and issues for the current repo.
- **AI model calls** (`src/host/lm.ts`) send text to a VS Code language model (`vscode.lm`, e.g.
  Copilot). Two callers: the **AI block** sends its prompt (and, when its `scope` is `document`, the
  document's text); **inline revision** sends the selected text plus the instruction. Both are **data
  egress** — the text leaves the machine for the model provider. Guards: **off by default**
  (`omd.ai.enabled`); runs **only on an explicit action** (Run, or accepting a revise), never on load;
  the model is the user's own configured provider (OMD holds no keys and adds no endpoint of its own);
  the request is cancellable and dies with the editor. See R6.
- **No telemetry**, no analytics, no auto-update channel of its own.

## Residual risks & recommendations

| # | Risk | Severity | Status / recommendation |
|---|------|----------|----------------|
| R1 | Exported HTML could carry active content from a malicious source doc | Medium | **Mitigated.** The export is sanitized (`src/host/sanitize-html.ts`): the rendered fragment is parsed to hast and the execution vectors are stripped (script/iframe/object/embed/foreignObject/form/link/meta/base/noscript elements, `on*` handlers, `javascript:`/`vbscript:`/`data:text-html` URLs incl. control-char-obfuscated), preserving the trusted injected SVG/highlighting/wrappers. The live preview panel needs no sanitization (webview nonce CSP). |
| R2 | Link-card fetch SSRF to internal/link-local hosts | Low–Medium | **Mitigated.** Each URL's hostname is DNS-resolved and rejected if any address is private/loopback/link-local/reserved (`src/host/ssrf.ts`, `linkMeta.ts`); redirects are followed manually so every hop is re-checked; http(s)-only, timeout- and byte-bounded. |
| R3 | Link-card thumbnails load arbitrary `https:` images (`img-src https:`) — a privacy beacon on render | Low | Acceptable (images are cached on insert, not refetched on load); optionally proxy/cache image bytes host-side. |
| R4 | Bundled dependency vulnerabilities | Low | `npm audit` in CI; the shipped surface is only what's bundled (see `THIRD-PARTY-NOTICES.md`). Current advisories are in dev/build tooling, not the shipped runtime — confirm each release. |
| R5 | Large/pathological documents causing editor hangs | Low | See `docs/operations/PERFORMANCE.md`; add input-size guards if a real case appears. |
| R6 | AI features send prompt / document / selection text to a language model (data egress) | Low–Medium | **Opt-in.** Off unless `omd.ai.enabled`; runs only on an explicit action (AI-block Run, or a Revise), never on load. The AI block sends its prompt (+ the document under `scope: document`); inline revision sends the selected text + instruction. The destination is the user's own configured `vscode.lm` provider (OMD holds no keys, adds no endpoint). Surfaced in the setting's description so the egress is disclosed before use. |

## Assumptions

- VS Code's webview isolation, CSP enforcement, and iframe sandboxing behave as documented.
- The user trusts the workspace they open (VS Code Workspace Trust still gates extension activation).
- The host OS enforces normal filesystem permissions.
