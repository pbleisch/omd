# OMD — Documentation

Everything written about OMD lives here, split by what you came to do.

## [`design/`](design/) — read to *understand*

The design corpus: why OMD exists, the convictions that decide hard calls, how it's shaped, the
look, the stack, and the sacred on-disk contract. Intentionally small and prescription-light — it
fixes the *essence*, not a file layout. If you're forking OMD or making a non-trivial change, start
here, in order:

**VISION → PRINCIPLES → ARCHITECTURE → SMART-BLOCKS → FORMATS → STYLE → DEPENDENCIES → DECISIONS**
(see [`design/README.md`](design/README.md) for the guided reading order).

## [`operations/`](operations/) — read to *run and ship it*

Operational runbooks, each a standalone reference:

- [`operations/RELEASING.md`](operations/RELEASING.md) — cutting a release, incl. the human-only account steps.
- [`operations/PERFORMANCE.md`](operations/PERFORMANCE.md) — where bytes and time go, and the baselines to hold.
- [`operations/THREAT-MODEL.md`](operations/THREAT-MODEL.md) — trust boundaries, residual risks, assumptions.
- [`operations/GFM-COMPATIBILITY.md`](operations/GFM-COMPATIBILITY.md) — where OMD canonicalizes markdown on save vs. what it preserves byte-for-byte, measured against the GFM spec.

## [`contributing/`](contributing/) — read to *extend*

Task-oriented how-tos (a convenience layer, not part of the design corpus):

- [`contributing/AUTHORING-SMART-BLOCKS.md`](contributing/AUTHORING-SMART-BLOCKS.md) — add a smart block from files, with the full `block.json` reference and the two author render tiers. Copy-start examples in [`../examples/blocks/`](../examples/blocks/).

## Also worth knowing

- [`../AGENTS.md`](../AGENTS.md) — the short brief for coding agents: shape, commands, hard gates, definition of done.
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — build, test, and the non-obvious round-trip invariants (read to *build*).
- [`../README.md`](../README.md) — what OMD is, for a user installing it.

## The map, in one line

*Understand it* → `design/`. *Change it* → `AGENTS.md` + `CONTRIBUTING.md`. *Ship it* → `operations/`.
