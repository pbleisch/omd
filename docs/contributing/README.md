# Contributing how-tos

Task-oriented guides for extending OMD. These are a **convenience layer** — concrete, step-by-step,
and explicitly *not* part of the prescription-light design corpus in [`../design/`](../design/). A
fork can keep the essence and rewrite these.

- [`AUTHORING-SMART-BLOCKS.md`](AUTHORING-SMART-BLOCKS.md) — add a smart block from files, with a full
  `block.json` reference and the two author render tiers. Copy-start examples:
  [`../../examples/blocks/`](../../examples/blocks/).

Accelerators:

- `npm run new:block -- <name>` scaffolds a valid block into `.omd/blocks/` (`scripts/new-block.mjs`).
- Coding agents can invoke the **`add-smart-block`** skill (`.claude/skills/add-smart-block/`), which
  walks the same workflow end to end.

For build/test mechanics and the round-trip invariants, see [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md);
for the hard gates and commands, [`../../AGENTS.md`](../../AGENTS.md).
