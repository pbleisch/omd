# Tables

Tables are plain GFM on disk, but OMD edits them like a small spreadsheet. Everything below is a
real `| … |` table — hover one to see the controls.

<!-- omd:toc {"ordered":false,"maxLevel":"2"} -->

## On-canvas controls

Hover a table and OMD reveals:

- A **column bar** above and a **row bar** to the left — click a segment to select the whole
  row/column, drag it to **reorder** (the header row stays pinned).
- **"+" buttons** on every row/column boundary to insert there.
- A **sort toggle** on each column header (click to sort ascending, again for descending).

Try reordering rows or sorting the population column:

| City      | Country | Population (M) |
| :-------- | :------ | -------------: |
| Tokyo     | Japan   |           37.4 |
| Delhi     | India   |           32.9 |
| Shanghai  | China   |           29.2 |
| São Paulo | Brazil  |           22.6 |
| Cairo     | Egypt   |           21.9 |

## Keyboard-first editing

- <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> move between cells; <kbd>Tab</kbd> in the last
  cell **appends a row**.
- <kbd>Enter</kbd> moves to the cell below; arrow keys cross cell boundaries.

## High-fidelity copy

Select a range of cells and copy — OMD puts a real `<table>` (and TSV) on the clipboard, so pasting
into Excel, Google Sheets, Word, or Docs lands a clean table rather than a wall of text.

## Alignment

Per-column alignment is standard GFM and round-trips exactly:

| Left   | Center | Right |
| :----- | :----: | ----: |
| apple  |  ripe  |  1.20 |
| fig    |  green |  0.05 |
| cherry |  sweet | 12.00 |

---

_Next: [[Wiki Workflow]] →_
