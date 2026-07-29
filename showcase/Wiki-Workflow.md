# Wiki Workflow

OMD is a great editor for a **folder of linked markdown files** — whether that's a cloned GitHub
wiki or any local "knowledge base" directory. This `showcase/` folder is exactly that: a flat set of
`.md` pages tied together with links. Nothing here requires a special mode — it's just markdown.

<!-- omd:toc {"ordered":false,"maxLevel":"2"} -->

## Wikilinks

Wikilinks are the one OMD-specific inline form. They stay `[[…]]` bytes on disk (so they're
harmless everywhere) and OMD renders them as clickable links that open the sibling page:

- Short form: [[Home]] → opens `Home.md`
- Labeled form (label **before** the pipe, target after): [[the media page|Media]]

Click one to jump — try [[Tables]] or [[GFM Fidelity]].

## Backlinks

Because this page links to [[Smart Blocks]] and [[Media]], OMD lists **this page**
as a backlink when you open either of those. Backlinks are computed across the whole workspace, so a
flat wiki stays navigable in both directions without any manual index.

## Mentions & issues

Unlike wikilinks, mentions and issue references are **always real links on disk** — they resolve for
every reader, GitHub included:

- Mention: [@octocat](https://github.com/octocat)
- Issue: [#1](https://github.com/anthropics/omd/issues/1)

OMD styles them inline (and offers a picker), but the bytes are ordinary markdown links.

## GitHub wiki workspace

A GitHub wiki is a Git repo of markdown pages. Clone it and open the folder in OMD:

> [!NOTE]
> `[[Page Name]]` wikilinks connect pages across the flat set. `_Sidebar.md` renders as navigation
> on every page and `_Footer.md` at the bottom — this showcase ships both. GitHub maps
> `[[Page Name]]` to `Page-Name.md` (spaces ↔ dashes), and OMD resolves them the same way — so
> `[[Smart Blocks]]` opens `Smart-Blocks.md` with no need to spell out the exact file name.

The *wiki publish/clone workflow* itself lives in a separate extension — OMD's job is to make
**editing the pages** excellent.

## Local wiki workspace

You don't need GitHub at all. Any local folder of `.md` files works the same way: wikilinks,
backlinks, relative links, and local media ([[Media]] shows `media/…` references) all resolve
within the folder. Cross-file links can be wikilinks **or** plain relative markdown links, e.g.
[the backlog](BUGS.md) — both navigate in OMD and render on GitHub.

---

_Back to [[Home]] · see the [[Backlog|BUGS]]._
