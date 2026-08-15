# OMD — GFM compatibility & round-trip limitations

OMD's promise is that your `.md` stays plain, GitHub-renderable markdown and comes back unchanged
([`PRINCIPLES.md`](../design/PRINCIPLES.md), Principle 2). That promise holds where it counts — but
it is worth being precise about *what* is preserved, because OMD edits through a ProseMirror/Milkdown
document model that **canonicalizes some markdown syntax on save**. This page is the honest, measured
account of the gaps, so nobody is surprised.

Measured against the **GitHub Flavored Markdown spec** (GFM 0.29, [`github/cmark-gfm`](https://github.com/github/cmark-gfm))
— its 670 examples are vendored under `test/fixtures/gfm-spec/` and run by the conformance suite (see
[How this is measured](#how-this-is-measured)).

## What is guaranteed

- **No content is ever lost or corrupted.** Across all 670 GFM examples, no round-trip drops or
  garbles document text. A dedicated test ratchets this so it can't regress
  (`test/gfm-roundtrip-all.test.ts`).
- **It renders the same on GitHub.** Every construct below produces byte-identical *rendered output*
  on GitHub before and after an OMD save — the differences are in the markdown *source syntax*, not
  what a reader sees.
- **OMD's own on-disk forms are byte-exact.** Everything in [`FORMATS.md`](../design/FORMATS.md) —
  smart-block shortcodes, comment threads/anchors, columns, aligned blocks, media, `<details>`,
  math, mermaid — round-trips byte-for-byte and is covered by tests.

## Canonicalized on save (same meaning, different source)

When you open and save a file, OMD rewrites these to its canonical style. The document renders
identically; only the markdown bytes change:

| Construct | Written as | Example |
| --- | --- | --- |
| Setext headings | ATX (`#`) | `Title` / `=====` → `# Title` |
| ATX closing hashes | dropped | `# Heading #` → `# Heading` |
| Bullet markers | `-` | `* a`, `+ a` → `- a` |
| Ordered-list markers | `1.` (dot), leading zeros stripped | `1) a` → `1. a`; `003.` → `3.` |
| Thematic breaks | `---`, but `***` as the first block | `***`, `___`, `- - -` → `---`; a leading `---` → `***` |
| Code blocks | fenced (```) | a 4-space-indented block → a ` ``` ` fence |
| Tabs | spaces | leading/though-line tabs are expanded |

These are deliberate serializer settings, not bugs — OMD picks one house style so the on-disk form is
consistent. If you author in these styles, expect a one-time normalization on first save.

The thematic-break row has one exception, and it is a safety guard rather than a style choice. A
`---` on line 1 opens YAML front matter, which then closes on the *next* `---` anywhere in the file —
blank lines and prose in between are not checked, and the tokenizer has no option to make it
stricter. A document that starts with a thematic break and contains any later `---` would therefore
reopen as a single front matter node and stop being prose. So a document-initial thematic break is
written `***`, which GitHub renders identically and which cannot open front matter (#23).

## Known gaps & edge cases

Real deviations we're choosing to live with (for now), roughly in order of how likely you are to hit
one:

- **A link label carrying inline formatting splits the link.** `[*foo* bar](/url)` comes back as
  `*[foo](/url)* [bar](/url)` — one link becomes two, because ProseMirror serializes the emphasis
  mark outside the link mark. It hits reference links (`[*foo* bar]` with a definition) the same
  way, since a reference is the same kind of mark. A plain label is unaffected; this is a
  mark-priority question in the editor's document model, not a link-syntax one.
- **Empty list items / blockquotes gain a `<br />`.** An empty item (`- ` on its own) or empty
  blockquote (`>`) serializes with Milkdown's empty-block marker, e.g. `- <br />`. Harmless and rare.
- **Two lists that differ only by their marker become one.** `- a` then `* b` (or `1.` then `1)`)
  is two lists in markdown but one kind of node in the editor's model, so an edit in the document
  can merge them into a single list, with ordered numbering continuing across the seam. Deleting
  the block *between* two lists of the same type merges them the same way — there it is the
  intended behavior, not a gap (#22).
- **Entities inside link URLs/titles and code-fence info strings decode.** `[x](/f&ouml;&ouml;)` →
  `[x](/föö)`. Entities in ordinary text *are* preserved (see below); these positions are not yet
  covered.
- **Malformed HTML is defensively escaped.** Text that looks like an invalid tag (`<a h*#ref="hi">`,
  `<33>`) gets its `<`/`*`/`_` backslash-escaped so it stays literal text. It re-parses to the same
  text; only the bytes differ.

## What we've fixed (previously lost, now preserved)

- **Literal `<br>`** — was silently dropped (`a<br>b` → `ab`); now preserved as a real line break
  (`plugins/hardbreak`).
- **HTML entities** — `&copy;`, `&nbsp;`, `&#35;`, `&#x2A;` were decoded to their characters on save
  (`&nbsp;`→space is a real semantic change); now preserved byte-for-byte in text (`plugins/entities`).
- **Tight flow boundaries** — a block written on the line directly after the previous one
  (`> [!NOTE]` then `> - item`, a heading, fence, table or list after a paragraph) gained a blank
  line on save; the boundary the source proves tight is now kept (`plugins/tight-flow`, #11). The
  exception is a seam whose single newline would change what the bytes mean on reopen — OMD's
  canonical `---` one line after a paragraph is that paragraph's setext underline, so a thematic
  break keeps its blank line.
- **Reference-style links & images** — `[label]: /url` definitions were deleted and every `[ref]`,
  `[ref][]`, `[text][ref]` and `![alt][ref]` rewritten to an inline link *at parse time*, so opening
  a document destroyed the authoring style before the editor saw it. Now they are real schema nodes
  and the definition keeps its own bytes (`plugins/reference-links`, #33).

## How this is measured

The gaps above are not guesses — they're derived from a living benchmark:

- `test/gfm-conformance.test.ts` — the raw-HTML sections on two axes (export HTML vs the spec;
  round-trip no-loss), as per-section **ratchet** tests.
- `test/gfm-roundtrip-all.test.ts` — all 670 examples, classifying each round-trip diff as
  *style-only* (same content, canonical syntax) or a *content change* (all semantically-preserving),
  and ratcheting the content-change count against the baseline recorded in the test (currently 20)
  so no real data loss can slip in. The run prints the current split of both buckets; a serializer
  fix moves examples between them, so read the counts from the run rather than from this page.

Run them with example-level detail:

```bash
npx vitest run test/gfm-conformance.test.ts test/gfm-roundtrip-all.test.ts   # scoreboards
SPEC_VERBOSE=1 npx vitest run test/gfm-conformance.test.ts                    # failing example #s
RT_VERBOSE=1  npx vitest run test/gfm-roundtrip-all.test.ts                   # per-section example #s
```

Update the vendored spec deliberately (re-pull a tagged cmark-gfm `test/spec.txt`, re-record the
baselines) — see `test/fixtures/gfm-spec/README.md`.

## Reporting a gap

If OMD changes a file in a way that alters what a reader *sees* on GitHub — that's a bug, not a
listed limitation; please file it with the smallest markdown that reproduces it. The limitations here
are, by definition, the ones where the rendered output is unchanged.
