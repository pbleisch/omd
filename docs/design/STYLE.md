# OMD — Visual Style

How OMD looks, precisely enough that two people build a consistent surface rather than two
plausible but different ones. This document is as exacting as [`FORMATS.md`](FORMATS.md) and
for the same reason: "it has to feel finished" ([`PRINCIPLES.md`](PRINCIPLES.md) §7) is not
achievable if the look is improvised per-plugin.

## The one rule: look like VS Code, not like a brand

OMD is not a branded surface. It should read as part of the editor it lives in. That means
**theme-variable-first**: every theme-dependent color is `var(--vscode-*, <fallback>)`,
inheriting the user's theme (dark, light, high-contrast) automatically. The fallback targets
dark. **Do not invent a palette.** Hardcoded hex is disallowed except the alert accents below.

Roles map to VS Code variables — the ones you reach for constantly:

| Role | Variable |
|---|---|
| Editor surface / text | `--vscode-editor-background` / `--vscode-editor-foreground` |
| Panel / sidebar surface | `--vscode-sideBar-background` |
| Border / divider | `--vscode-panel-border` |
| Primary / secondary button | `--vscode-button-background` / `--vscode-button-secondaryBackground` |
| Input field | `--vscode-input-background` / `-foreground` / `-border` |
| List hover / selected | `--vscode-list-hoverBackground` / `--vscode-list-activeSelectionBackground` |
| Link | `--vscode-textLink-foreground` |
| Focus ring | `--vscode-focusBorder` |
| Code chip / blockquote | `--vscode-textCodeBlock-background` / `--vscode-textBlockQuote-*` |
| Error / warning | `--vscode-errorForeground` / `--vscode-editorWarning-foreground` |

**States:** hover uses `--vscode-list-hoverBackground` (or the secondary-button color for icon
buttons); focus is a `1px` outline in `--vscode-focusBorder`, never removed without a
replacement; disabled is `opacity: 0.5` + `pointer-events: none`, never an invented gray.

## The only allowed hardcoded color: alert accents

The five GitHub alert kinds carry fixed accents so they read exactly as on GitHub. These are
the **only** literal hex values permitted in OMD chrome CSS:

| Kind | Accent | Codicon |
|---|---|---|
| `note` | `#58a6ff` blue | `info` |
| `tip` | `#3fb950` green | `light-bulb` |
| `important` | `#a371f7` purple | `megaphone` |
| `warning` | `#d29922` amber | `warning` |
| `caution` | `#f85149` red | `error` |

Applied as a left border plus a low-alpha background (`rgba(accent, 0.1)`), with a title row
pairing the codicon and the kind's label in the accent color. (Data-viz series colors and the
forced black-on-white of exported math are content, not chrome, and are exempt.)

## Icons and emoji have separate jobs

- **Codicons (`@vscode/codicons`) for all chrome** — toolbars, buttons, block headers. They're
  monochrome and inherit `currentColor`, which is what keeps everything theme-aware.
  Conventional ones: `edit`, `copy`/`check`, `trash`, `refresh`, `shield` (sandboxed block
  badge), `layout-sidebar-left`/`-right`. Copy buttons swap `copy`→`check` on success, back
  after ~1500 ms.
- **Emoji are in-content semantic markers only**, never chrome: `📅` inline date, `📊` chart
  data summary. Putting an emoji on a button is a violation; use a codicon (the selection
  markers — add-comment, revise-with-AI — are codicon buttons for exactly this reason).

## Shape and spacing come from scales, not guesses

**Radius:** `2px` inline chips · `3px` menu items / small controls · `4px` inputs, buttons,
toolbars, cards · `6px` panels, popovers, dialogs, smart-block surface · `999px` toggles and
tag pills. Headers above a body round the top only.

**Spacing:** a 4px base — `4 / 8 / 12 / 16`. Step up before inventing an odd value. (Alert body
`8px 16px`; control padding ~`4px 8px`.)

## Layout

| Surface | Size |
|---|---|
| Left sidebar (Outline) | `250px` |
| Right sidebar (Comments) | `300px` |
| Backlinks | inside the Outline sidebar, up to ~50% height |
| Floating param panel | `300–420px` |
| Inline menus (slash, mention, issue, emoji) | `~180–250px` min, `~320–500px` max |

Sidebars slide in over a `--vscode-panel-border` edge with a toggle button per side. Smart-block
chrome is a header bar (icon + name left, actions right, optional Preview/Source tabs) above a
`contenteditable:false` content area. Popovers anchor to the cursor/selection, float above the
editor, and dismiss on outside click or `Escape`.

## Naming

All OMD classes use an `omd-` prefix to avoid colliding with ProseMirror and VS Code
(`.omd-toolbar`, `.omd-slash-menu`, `.omd-smart-block`). A block author's own CSS is scoped to
`.omd-block--<id>` (double hyphen) so one block's styles can't leak into another's.

## The feel, not just the tokens

Tokens keep it consistent; Principle 6 keeps it calm. Controls appear on hover or selection and
recede otherwise. The writing surface shows content, never machinery. A surface that's
technically themed but cluttered, cramped, or busy has met this file and still failed the
principle.
