---
title: OMD Showcase
tags:
  - demo
  - markdown
  - wiki
draft: false
---

<img src="media/omd-logo.svg" width="120" alt="OMD logo">

# OMD Showcase

Welcome to the **OMD** showcase — a small, self-contained wiki that doubles as a feature tour.
Every page here is **plain, GitHub-renderable markdown on disk**: open it in OMD, edit the
document visually instead of its source, save, and it comes back byte-for-byte.

<!-- omd:toc {"ordered":false,"maxLevel":"2"} -->

> [!TIP]
> This whole folder is a **wiki workspace**. The links below are `[[wikilinks]]`; the
> `_Sidebar.md` and `_Footer.md` pages follow the GitHub-wiki convention. See [[Wiki Workflow]]
> for how cross-file editing works — in a cloned GitHub wiki or any local folder of `.md` files.

## Start here

| Page                | What it shows                                                                    |
| :------------------ | :------------------------------------------------------------------------------- |
| [[GFM Fidelity]]  | Everything standard GitHub Flavored Markdown — rendered natively, byte-stable    |
| [[Smart Blocks]]  | OMD's rich blocks, each with a **coexistence form** that still renders on GitHub |
| [[Media]]         | Image sizing, captions, alignment, local media, YouTube, galleries               |
| [[Tables]]        | Spreadsheet-style table editing                                                  |
| [[Wiki Workflow]] | Wikilinks, backlinks, mentions, and issue references across files                |
| [[Diagnostics]]   | Broken links and images, marked inline where they occur                          |

## Two kinds of feature

OMD's features fall into two buckets, and this showcase keeps them clearly separated:

<table><tr><td>

### Native GFM

Headings, lists, tables, code, task lists, alerts, footnotes, autolinks, math, and mermaid —
OMD renders them richly **and** leaves the exact markdown on disk, so GitHub shows the same thing.

</td><td>

### OMD-unique

Smart blocks, resizable/aligned media, wikilinks, inline comments, on-canvas table controls —
each one is written in a **coexistence form** so a plain-markdown reader still sees something sensible.

</td></tr></table>

## What to try

- [ ] Open any page and edit it — then check `git diff`: untouched constructs don't move.
- [ ] Click a [[wikilink]] to jump between pages.
- [ ] Hover a table for the row/column controls; hover an image for resize handles.
- [ ] Press `/` for the slash menu, or use the toolbar — both drive the same commands.

---

_Next: [[GFM Fidelity]] →_
