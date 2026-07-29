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
| Thematic breaks | `---` | `***`, `___`, `- - -` → `---` |
| Code blocks | fenced (```) | a 4-space-indented block → a ```` ``` ```` fence |
| Tabs | spaces | leading/though-line tabs are expanded |
| Reference-style links & images | inline | `[foo][bar]` + `[bar]: /url` → `[foo](/url)` (see below) |

These are deliberate serializer settings, not bugs — OMD picks one house style so the on-disk form is
consistent. If you author in these styles, expect a one-time normalization on first save.

## Known gaps & edge cases

Real deviations we're choosing to live with (for now), roughly in order of how likely you are to hit
one:

- **Reference-style links/images are inlined.** `[text][label]` with a `[label]: /url "title"`
  definition becomes an inline `[text](/url "title")`, and the separate definition is dropped. It
  renders identically, but it rewrites a legitimate authoring style (link definitions collected at the
  bottom of a document) and is the single biggest source-fidelity gap. Preserving it is a sizeable
  feature (new `linkReference`/`imageReference`/`definition` nodes) — tracked, not yet done.
- **Empty list items / blockquotes gain a `<br />`.** An empty item (`- ` on its own) or empty
  blockquote (`>`) serializes with Milkdown's empty-block marker, e.g. `- <br />`. Harmless and rare.
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

## How this is measured

The gaps above are not guesses — they're derived from a living benchmark:

- `test/gfm-conformance.test.ts` — the raw-HTML sections on two axes (export HTML vs the spec;
  round-trip no-loss), as per-section **ratchet** tests.
- `test/gfm-roundtrip-all.test.ts` — all 670 examples, classifying each round-trip diff as
  *style-only* (same content, canonical syntax — currently 364) or a *content change* (currently 106,
  all semantically-preserving), and ratcheting the content-change count so no real data loss can slip
  in.

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
