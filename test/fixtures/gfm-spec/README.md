# GFM spec conformance fixture

`spec.txt` is a **verbatim, pinned snapshot** of the GitHub Flavored Markdown spec's example
suite — the conformance corpus GitHub's own renderer is tested against.

- **Source:** [`github/cmark-gfm`](https://github.com/github/cmark-gfm) → `test/spec.txt`
- **Version:** GFM 0.29 (dated 2019-04-06) — the currently published GFM spec.
- **Format:** each example is fenced with `` ```…``` example[ <extension>] ``, the markdown input and
  expected HTML separated by a lone `.`. A `→` stands for a TAB (the CommonMark convention). Examples
  tagged `disabled` are skipped. Parsed by [`../../helpers/gfm-spec.ts`](../../helpers/gfm-spec.ts).

It's vendored (not fetched at test time) so the suite is offline, deterministic, and pins the exact
GitHub target version we measure against. Update it deliberately by re-pulling `test/spec.txt` from a
tagged cmark-gfm release and re-recording the conformance baselines.

**Licensing:** the spec text (incl. these examples) is authored by John MacFarlane and the CommonMark
community under **CC-BY-SA 4.0**; cmark-gfm itself is BSD-2-Clause (© GitHub, Inc.). This snapshot is
used unmodified for testing only. See `THIRD-PARTY-NOTICES.md`.
