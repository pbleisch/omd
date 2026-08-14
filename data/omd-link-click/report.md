# Ordinary markdown link navigation

## What changed

OMD now follows every editable inline link with **Cmd+click on macOS** or **Ctrl+click on other
platforms**. This includes ordinary and reference-style markdown links, wikilinks, mentions, and
issue links. A plain click remains available to place the cursor and edit the linked text. The
webview sends navigation intent only; it never edits or serializes the document as part of
following a link.

Ordinary markdown links have their own `openLink` host message. They do not pass through
`openTarget`, whose workspace page-name search remains the deliberately different wikilink rule.
The host opens resolved files with `vscode.open`, so Markdown, images, text, and other file types
use whichever VS Code editor normally owns them. A missing target produces a message that names
the original href and says which document-relative path was not found, without wikilink wording.

## Resolution rule

- A relative destination resolves from the directory containing the current document.
- `..` segments resolve normally and may leave the workspace. That is intentional: following a
  local link is an explicit user click, not an automatic host fetch. The SSRF restrictions in
  `src/host/ssrf.ts` protect document-controlled network fetches and do not apply to opening a
  user-selected local file.
- A leading `/` is relative to the current VS Code workspace folder, matching repository-root
  Markdown links.
- Percent-encoded paths are decoded first (`my%20doc.md` opens `my doc.md`), with the literal name
  retained as a fallback. CommonMark pointy-bracket destinations such as `<my doc.md>` are also
  supported, including by broken-link diagnostics. Explicit `file:` URIs are supported.
- `http`, `https`, protocol-relative, and `mailto` destinations open externally. Other authored
  schemes are refused rather than handed to the platform.
- A bare `#heading` is resolved and revealed entirely in the current webview. A
  `file.md#heading` path is resolved by the host, opened, and then revealed in either a normal text
  editor or OMD. Heading matching uses GitHub-style, de-duplicated slugs.

## Hover affordance

Each editable link's tooltip shows the destination and the platform-specific follow chord. While
Cmd/Ctrl is held, the editor arms all inline links and changes their cursor to a pointer; releasing
the modifier removes that state. Without the modifier the normal text-editing cursor behavior is
preserved.

## Deliberately unchanged surfaces

Inline navigation is now uniform: ordinary links, reference links, wikilinks, mentions, and issue
links all require Cmd/Ctrl+click and share the same hover affordance. Two non-editable navigation
surfaces remain plain-click by design:

- Outline sidebar entries remain plain-click because they are navigation chrome, not editable
  document text.
- The shortcode link-card preview remains plain-click because its card is explicitly
  `contentEditable=false`; its hidden markdown body is the round-tripped editable content.

## Verification

The real `/Users/paul/proj/personal/flo/README.md` was mounted read-only in the browser preview
running the shipped webview bundle. A plain click emitted no navigation. Cmd+click on each of the
six documentation links under **Learn more** emitted exactly one document-relative `openLink`:

- `docs/DESIGN.md`
- `docs/ARCHITECTURE.md`
- `docs/EXTENSIONS.md`
- `docs/SOURCE_POLICIES.md`
- `docs/DEVELOPMENT.md`
- `docs/THREAT_MODEL.md`

All six resolved files exist beneath the Flo repository. The README's SHA-256 and modification
time were identical before and after verification; it was never modified. Browser inspection also
confirmed the Cmd-hover pointer, tooltip, and release behavior. Host integration tests cover
document-relative siblings, nested and upward paths, workspace-root paths, percent-encoded and
spaced names, explicit file URIs, non-Markdown files, missing files, fragments, heading lookup, and
the intentional difference from wikilink resolution. Unit tests cover the click/modifier contract,
same-document reveal with no host message, every inline link form, and the hover affordance.
