# OMD — On-Disk Formats

This is the contract [`PRINCIPLES.md`](PRINCIPLES.md) calls sacred: exactly how OMD's
constructs live in the `.md` file. Prose elsewhere describes intent; this fixes the bytes.
When they seem to disagree, this wins for the serialized form.

**The invariant.** Open any document, save it with no edit, and it comes back byte-for-byte
(after whitespace normalization). Everything below is chosen so that a reader on GitHub, or
in any other editor, sees correct markdown — the OMD-specific machinery is always an HTML
comment, which renders as nothing.

Everything not listed here is **plain GFM** — headings, paragraphs, inline marks, links,
images, lists, task lists, tables, code fences, blockquotes, rules, GitHub alerts
(`> [!NOTE]`), mermaid fences, math (`$…$` and `$$`), `<details>`, footnotes. OMD reads and
writes these as-is and must not regress them.

---

## Comment threads

Thread metadata is one YAML block inside a single trailing HTML comment, after all document
content. Opener is `<!-- omd-threads` on its own line; closer is `-->`.

```markdown
<!-- omd-threads
- id: t1
  status: open
  comments:
    - author: alice
      body: This needs a citation.
      date: 2026-01-02T10:00:00Z
-->
```

**Reactions are a map of emoji → users**, not an array of objects:

```yaml
reactions:
  👍: [bob, carol]
  🎉: [dave]
```

The text a thread refers to is wrapped in place by an invisible anchor pair keyed to the
thread id, written when the comment is created:

```markdown
The quick <!-- omd-start:t1 -->brown fox<!-- omd-end:t1 --> jumps.
```

Anchors are hidden in the editor and on GitHub and preserved byte-for-byte on save. A thread
is bound to a *region*, not just to a copied string.

---

## Smart-block shortcodes

**Leaf** — a single tag carrying id and JSON params:

```markdown
<!-- omd:youtube {"url":"https://youtu.be/abc123"} -->
```

**Container** — opener, real-markdown body, matching close tag:

```markdown
<!-- omd:collapsible {"summary":"Details"} -->
Body **markdown** here, including lists:

- one
- two
<!-- /omd:collapsible -->
```

Rules:

- Params are always JSON, present even when empty (`{}`), values JSON-escaped.
- A container body is saved by **serializing the editor's document nodes back to markdown** —
  inner headings, lists, images, and code fences are preserved. Flattening the body to plain
  text is a fidelity bug.
- Copying a block's source yields the same bytes written to disk.

Most blocks also emit an equivalent plain-GFM rendering next to the shortcode (see below), so
GitHub shows real content rather than an empty comment.

---

## Constructs with a GFM-visible form

These serialize so the shortcode *and* a plain rendering coexist — OMD reads the shortcode,
everyone else sees the GFM.

**Multi-column** (`2col` / `3col`) → a raw HTML table; each cell holds real markdown
surrounded by blank lines; empty cells get `&nbsp;`:

```markdown
<table><tr><td>

Left column **markdown**.

</td><td>

Right column markdown.

</td></tr></table>
```

**Image alignment** → the image wrapped in a `<div align="...">` block (`left`/`center`/`right`):

```markdown
<div align="center">

![Logo](logo.png)

</div>
```

**Media blocks** (`image`, `youtube`, `gallery`) emit their real image/thumbnail markdown
inside the container body, so the media is visible on GitHub.

**Chart** emits a data table as its GFM fallback.

**Link card** caches the fetched preview (`title`/`description`/`image`/`site`) in its params and
emits a plain `[title](url)` link as its body, so GitHub shows an ordinary link while OMD draws a
rich card:

```markdown
<!-- omd:linkcard {"url":"https://example.com/post","title":"Example Post","description":"…","image":"https://example.com/og.png","site":"Example"} -->

[Example Post](https://example.com/post)

<!-- /omd:linkcard -->
```

Metadata is fetched host-side (the webview is CSP/CORS-blocked) only on an explicit insert or
refresh — never on load, so opening a file makes no network request.

**AI block** (`ai`) stores its embedded prompt in params and caches the generated markdown as its
body — the same coexistence trick as `linkcard`, so a GitHub reader sees the result and the file
round-trips:

```markdown
<!-- omd:ai {"prompt":"Summarize the notes above","scope":"document","model":"gpt-4o"} -->

- First generated point.
- Second generated point.

<!-- /omd:ai -->
```

- Params: `prompt` (the instruction), `scope` (`none` | `document` — whether the whole document is
  sent as context), and an optional `model` family override (else the `omd.ai.model` setting).
- The body is the cached generated markdown, serialized back from the editor's nodes like any
  container body. It is the GitHub-visible fallback.
- A model call happens **only on an explicit Run/Refresh, never on load** — the same rule as
  `linkcard`. Output is non-deterministic, so re-running on open would break the round-trip; caching
  the last result and re-running only on demand is what keeps open→save byte-stable. The host owns
  the call (`vscode.lm`); the webview can't reach a model. AI is off unless `omd.ai.enabled` is set.

---

## Inline references

| On disk | Renders / navigates to |
|---|---|
| `[[Roadmap]]` | link labeled "Roadmap" → page `Roadmap` |
| `[[the plan\|Roadmap]]` | label **before** the pipe, target **after** → page `Roadmap` |
| `[@alice](https://github.com/alice)` | a real link mark, not literal `@alice` text |
| `[#123](https://github.com/<owner>/<repo>/issues/123)` | a real link to the issue |

`<owner>/<repo>` come from the repo the workspace is in. Mentions and issues are always real
links on disk, never bare tokens.

**Dates** decorate the bare token `📅 YYYY-MM-DD`. Relative input (today, `+7d`) is resolved
to a concrete date on insert; the on-disk form is always the resolved `📅 YYYY-MM-DD`.

---

## How to hold the line

Every construct here needs a round-trip test: input document → open → save → assert identical
bytes. That test suite is the enforcement of Principle 2, and the fastest way to know a new
feature hasn't quietly broken portability.

The contract above is about OMD's *own* constructs. For where OMD **canonicalizes ordinary GFM
syntax** on save (setext→ATX headings, `*`→`-` bullets, `1)`→`1.` list markers, …) — same rendered
output, different bytes — see the honest, spec-measured account in
[`../operations/GFM-COMPATIBILITY.md`](../operations/GFM-COMPATIBILITY.md).
