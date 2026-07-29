# OMD — Design Context

OMD is a VS Code extension that replaces the default markdown editor with a WYSIWYG surface:
you edit the finished document — callouts, columns, diagrams, charts, comments — and the file
on disk stays plain, GitHub-renderable markdown.

This directory (`docs/design/`) is the design context for OMD — the *why* and the *essence*. For the
whole documentation map, see [`../README.md`](../README.md). It is intentionally small. It captures the
*essence* — why OMD exists, the rules that decide hard calls, how it's shaped, the look, the
stack, and the on-disk contract that keeps it portable — and deliberately does **not**
prescribe a file layout or line counts. Honor the vision, the principles, the formats, the
look, and the library choices; the module structure and exact versions are yours.

## Read in this order

1. **[`VISION.md`](VISION.md)** — start here. Why OMD exists and the one tension (rich like
   Confluence, portable like markdown) that defines everything.
2. **[`PRINCIPLES.md`](PRINCIPLES.md)** — the seven convictions that turn the vision into
   decisions. When a detail is unspecified, decide by these.
3. **[`ARCHITECTURE.md`](ARCHITECTURE.md)** — how OMD is shaped: the two-process custom
   editor, the rich-view-over-markdown model, the plugin patterns. Guidance, not law.
4. **[`SMART-BLOCKS.md`](SMART-BLOCKS.md)** — the signature idea: rich objects that serialize
   to invisible, round-trip-safe markdown, plus the built-in set.
5. **[`FORMATS.md`](FORMATS.md)** — the sacred contract: exactly how content, blocks, and
   comments live in the file. One of the two most precise documents here, on purpose.
6. **[`STYLE.md`](STYLE.md)** — the look: theme-first color, alert accents, icons, the radius
   and spacing scales, layout sizes. Precise for the same reason FORMATS is.
7. **[`DEPENDENCIES.md`](DEPENDENCIES.md)** — the known-good stack and why each library is the
   one — several determine output fidelity, so they're part of the essence.
8. **[`DECISIONS.md`](DECISIONS.md)** — the choices worth carrying over, and how AI returned as
   one additive, opt-in block.

## Where AI sits

AI is a single opt-in surface — the `ai` smart block, off by default and host-mediated — not a
thread through the core. See [`DECISIONS.md`](DECISIONS.md) for the constraints that keep it
additive and [`SMART-BLOCKS.md`](SMART-BLOCKS.md) for the block itself.
