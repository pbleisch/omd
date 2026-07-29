---
title: Diagnostics
note: The tags line below is intentionally broken (unclosed "[") to demo the front-matter error.
tags: [unclosed
---

# Diagnostics

OMD checks your document as you edit and marks each problem **inline, where it is** — a wavy
underline on a bad link, an error banner on broken front matter — so you can spot and fix it in
place. A **document-issues chip** at the right end of the toolbar aggregates everything: it shows a
count (or an all-clear ✓), and clicking an entry jumps to the problem and flashes it.

> [!NOTE]
> The examples on this page are **intentionally broken**, so opening it lights up the inline marks
> and shows a few entries in the document-issues chip. That's expected — it's what a real problem
> looks like. **This page's own front matter is deliberately invalid** (see the red banner at the
> very top), and the links/images below are broken on purpose. (OMD marks problems in the editor
> itself; there's no Problems-panel round-trip.)

## Front matter

Invalid YAML front matter shows a **red error banner** with the parse message, right inside the
front-matter block, and drops it to Source view so you can fix it. This page's front matter (at the
very top) is intentionally broken — its `tags:` line opens a `[` list it never closes.

## Broken links

A link whose target file doesn't exist gets a **red wavy underline**. Hover it to see the reason
("Linked file not found"):

- Broken: [the missing notes](Nonexistent-Page.md)
- Works: [Home](Home.md)

## Empty links

A link with no target at all gets an **amber wavy underline** ("Link has no target") — a warning,
not an error:

- Empty: [this link goes nowhere]()
- Works: [Home](Home.md)

## Anchor links

A `#anchor` link is checked against the document's own headings. One that matches no heading gets an
**amber wavy underline**; a real one is left alone:

- Broken: [jump to a section that isn't here](#no-such-section)
- Works: [jump to Broken links](#broken-links)

## Missing images

An image whose file can't be found renders as a **red dashed box** with a media icon and its alt
text; hover it for "Image not found".

A bare markdown image that's missing:

![an illustration that doesn't exist](media/missing-example.svg)

A sized image that's missing:

<img src="media/also-missing.png" width="240" alt="a diagram that doesn't exist">

For comparison, one that resolves normally:

![the OMD logo](media/omd-logo.svg)

## Structural checks (shown in the chip)

Some problems have no single spot to underline — they're about the document's structure. These
surface in the **document-issues chip** rather than inline. (They're shown here as examples rather
than triggered live, because on GitHub an unclosed comment or tag would hide the rest of the page.)

**An unclosed HTML comment** (missing its `-->`) is flagged as an error:

```markdown
<!-- this comment is never closed
```

**An unbalanced `<details>` or `<table>`** (an opener with no matching close, or the reverse) is
flagged as a warning:

```markdown
<details>
No matching </details>.
```

---

_Back to [[Home]] · see the [[Backlog|BUGS]]._
