# OMD — Decisions

The choices that shape OMD and the reasoning behind them. Short by design: only the
decisions a builder would otherwise re-litigate or get wrong. Everything here is a default
you can revisit — but revisit it deliberately, knowing what it bought.

## Foundational choices

**A custom editor implemented as a webview.** VS Code lets an extension replace the editor
for a file type. Building the surface as a webview isolates OMD's rich UI from the rest of
the editor and gives a real browser environment for the rendering that callouts, diagrams,
and charts need. The cost is the two-process split and message passing; it's worth it.

**Markdown is the document model, end to end.** OMD is a rich *view* over markdown, not a
separate format converted at save time. This is what makes the round-trip achievable rather
than aspirational — there's no lossy translation step to get wrong.

**A ProseMirror-based editor (via Milkdown).** A real document model with NodeView and
decoration primitives is what the whole plugin system stands on. Chosen for round-trip
fidelity and true inline-rich editing, not familiarity. Substitute only if you can match
both.

**Smart blocks as file-based definitions, discovered in three layers.** Workspace → user →
shipped, first match wins. Teams extend the editor by checking a definition into the repo —
no rebuild, no fork. The built-ins use the same mechanism they'd use.

**Three trust tiers for block code.** Template-only and OMD's own shipped scripts run in the
editor; user-authored render code is sandboxed with no network or page access. Code you
didn't ship never runs with the editor's privileges.

**Comments stored in the file, not a sidecar.** Thread metadata is a trailing YAML comment
block and inline anchor pairs (see [`FORMATS.md`](FORMATS.md)). Collaboration stays portable
and travels with the document in Git, and the metadata can't be lost to a round-trip.

**CSS shipped as text, injected once.** Plugins carry their styles as strings the surface
concatenates into a single stylesheet, rather than loading external sheets a sandbox would
block. A small thing, but it's why the styling works at all inside the webview.

## AI: two additive, opt-in surfaces

AI is present as **additive, opt-in** surfaces that came back the way this section always said they
would: like a new block, unable to compromise the core. There are two — the `ai` **smart block**
(an embedded prompt whose result is cached as GFM) and **inline revision** (rewrite a selection,
shown as a diff to Accept/Reject, persisting nothing until Accept). The four constraints that made
"no AI" safe still bind both:

- **Opt-in and off by default.** Nothing contacts a model unless the user turns on `omd.ai.enabled`.
  With it off, OMD behaves exactly as it did before — self-contained, no model assumed reachable.
- **Host-mediated.** Only the host calls `vscode.lm`; the webview (a sandboxed, network-less iframe)
  can't reach a model. A run is *intent* sent to the host, mirroring how `linkcard` fetches.
- **Never on load; the round-trip is never at risk.** A model call happens only on an explicit action.
  The `ai` block caches its result as GFM (so a GitHub reader sees it and the file round-trips despite
  non-deterministic output); inline revision is decoration-only and persists nothing until Accept, so
  Reject leaves the file byte-identical.
- **Removable.** Both surfaces sit on one host LM service (`src/host/lm.ts`) and a streaming message
  family; deleting them leaves the rest of the product untouched.

Still deliberately **not** built: a chat participant and language-model tools. The two surfaces above
are the whole AI footprint. The prompt-execution seam (the LM service + `runPrompt` messages) is
feature-neutral — inline revision reused it with **no** new host or protocol work — so a further AI
affordance would ride the same seam without widening this footprint.
