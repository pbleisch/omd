import { describe, it, expect } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { mountEditor } from './helpers/editor';
import { buildTableCommands } from '../src/webview/commands/table';
import type { OmdCommand } from '../src/webview/commands/registry';
import { normalizeMarkdown } from '../src/shared/roundtrip';

/**
 * Phase 1: table operations as registry commands. Each is exercised the same way the
 * context menu drives it — against a live editor with the cursor in a cell — and the
 * result must round-trip to valid GFM (Principle 2). These commands are what turn OMD's
 * insert-only tables into editable ones.
 */

const TABLE = ['| A | B |', '| --- | --- |', '| 1 | 2 |', '| 3 | 4 |', ''].join('\n');

async function withTable(markdown = TABLE) {
  const { handle } = await mountEditor(markdown);
  const view = handle.getView();
  const byId = new Map(buildTableCommands(view.state.schema).map((c) => [c.id, c]));
  const cmd = (id: string): OmdCommand => {
    const c = byId.get(id);
    if (!c) throw new Error(`no table command ${id}`);
    return c;
  };
  return { handle, view, cmd };
}

/** Put the cursor inside the first cell whose text matches `text`. */
function cursorInCell(view: EditorView, text: string): void {
  let found = -1;
  view.state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.isText && node.text === text) found = pos + 1;
    return true;
  });
  if (found < 0) throw new Error(`no cell with text ${text}`);
  view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(found))));
}

function rowCount(md: string): number {
  // Body rows only: table lines minus the header and the delimiter row.
  return md.split('\n').filter((l) => l.trim().startsWith('|')).length - 2;
}

describe('table commands: structure', () => {
  it('inserts a row below the cursor', async () => {
    const { handle, view, cmd } = await withTable();
    cursorInCell(view, '1');
    cmd('table-row-below').run(view);
    expect(rowCount(normalizeMarkdown(handle.getMarkdown()))).toBe(3);
  });

  it('inserts a column to the right', async () => {
    const { handle, view, cmd } = await withTable();
    cursorInCell(view, '1');
    cmd('table-col-right').run(view);
    const out = normalizeMarkdown(handle.getMarkdown());
    // Header row gains a third cell → three column segments.
    const header = out.split('\n').find((l) => l.includes('A'))!;
    expect(header.split('|').filter((s) => s.trim() !== '').length).toBe(3);
  });

  it('deletes the cursor row', async () => {
    const { handle, view, cmd } = await withTable();
    cursorInCell(view, '1');
    cmd('table-row-delete').run(view);
    const out = normalizeMarkdown(handle.getMarkdown());
    expect(rowCount(out)).toBe(1);
    expect(out).not.toContain('1');
    expect(out).toContain('3');
  });

  it('deletes the whole table', async () => {
    const { handle, view, cmd } = await withTable();
    cursorInCell(view, '1');
    cmd('table-delete').run(view);
    expect(normalizeMarkdown(handle.getMarkdown())).not.toContain('|');
  });
});

describe('table commands: alignment', () => {
  it('sets a column alignment that round-trips into the delimiter row', async () => {
    const { handle, view, cmd } = await withTable();
    cursorInCell(view, '1'); // column 0
    cmd('table-align-right').run(view);
    const out = normalizeMarkdown(handle.getMarkdown());
    const delimiter = out.split('\n').find((l) => /^\|?\s*:?-+/.test(l.trim()) && l.includes('-'))!;
    // Right alignment marks the column with a trailing colon.
    expect(delimiter).toMatch(/-:/);
  });
});

describe('table commands: guards', () => {
  it('no-op outside a table', async () => {
    const { handle, view, cmd } = await withTable('just a paragraph\n');
    // Cursor is in the paragraph, not a table.
    expect(cmd('table-row-below').run(view)).toBe(false);
    expect(normalizeMarkdown(handle.getMarkdown())).toBe('just a paragraph\n');
  });
});
