# OMD — Principles

The convictions behind every decision. Few, and each one names how a build betrays it.
When a spec is silent or you're unsure, decide by these. A feature is done when it upholds
them and you'd put it in front of someone — not when a test goes green.

Read [`VISION.md`](VISION.md) first; these make it operational.

---

**1. You edit the document, never its source.**
Anything with a rendered form is shown rendered, and rendered things look right.
*Betrayed by:* visible `**` or `[^1]`, an untypeset `$x$`, an HTML comment shown as text,
an unhighlighted code fence, a diagram that says "unavailable."

**2. The round-trip is sacred.**
Open then save with no edit reproduces the file. A hand-authored document is recognized,
not silently rewritten into a different shape. The saved file renders correctly on GitHub
with nothing installed.
*Betrayed by:* a container body that doesn't come back, columns that flatten, a block that
changes shape on save, comment or anchor metadata leaking into rendered output.

**3. Structure is an object you place, not markup you maintain.**
Inserting or changing structure — a callout, a column layout, a date — is one deliberate,
reversible act on the object, never on the underlying characters.
*Betrayed by:* a toolbar button that splices literal text, a "Bold" that can't toggle off,
buttons that don't reflect the cursor's state, editing a block by hand-editing its markup.

**4. One of each surface, reachable every way.**
A capability is reachable from the toolbar, a shortcut, and the slash menu — all driving
the same code. Exactly one of each panel or menu exists.
*Betrayed by:* a toolbar that opens a different panel than the shortcut does, or an
affordance in the code with no way for a user to invoke it.

**5. Collaboration is ambient.**
Anyone reading can comment, mention, and link without leaving the page or entering a mode.
References resolve to real destinations.
*Betrayed by:* commenting that requires a side trip, `@mentions` or `#issues` that don't
become real links, pages that link here being undiscoverable.

**6. The surface stays calm; the machinery hides.**
Controls appear on hover or selection and recede otherwise. Metadata, anchors, and syntax
are invisible while writing. Affordances are sized and styled to be usable and pleasant for
non-technical writers.
*Betrayed by:* affordances cluttering every line, markup visible while writing, controls
too small or too dense.

**7. It has to feel finished.**
A feature that technically renders but is unstyled, misaligned, dead, or shallow is not
done. Depth is part of the feature, not a later pass.
*Betrayed by:* anything you'd apologize for while demoing it.

---

When you build, don't stop at "the spec item is satisfied." Open the editor, do what a
writer would do, and read these back. If one is betrayed, the feature isn't done — even if
every gate is green.
