import { describe, it, expect, afterEach } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import { mountEditor } from './helpers/editor';
import { mountCommentMarker } from '../src/webview/ui/comment-marker';

/**
 * The add-comment marker (ui/comment-marker.ts). It shows on a text selection but is suppressed
 * for a table CellSelection — a thread anchor is an inline HTML-comment pair that can't span table
 * structure, so wrapping a cell range would corrupt the table.
 */

function marker(): HTMLElement | null {
  return document.querySelector('.omd-comment-marker');
}

afterEach(() => {
  document.querySelectorAll('.omd-comment-marker').forEach((n) => n.remove());
});

describe('comment marker visibility', () => {
  it('shows on a non-empty text selection', async () => {
    const { handle } = await mountEditor('Hello world.\n');
    const view = handle.getView();
    view.hasFocus = () => true; // isolate the selection logic from jsdom focus
    mountCommentMarker(view);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6)));
    expect(marker()?.style.display).not.toBe('none');
  });

  it('hides for a multi-cell table selection', async () => {
    const { handle } = await mountEditor('| A | B |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |\n');
    const view = handle.getView();
    view.hasFocus = () => true;
    mountCommentMarker(view);

    const cellPos = (t: string): number => {
      let p = -1;
      view.state.doc.descendants((n, pos) => {
        if ((n.type.name === 'table_cell' || n.type.name === 'table_header') && n.textContent === t) p = pos;
      });
      return p;
    };
    const sel = CellSelection.create(view.state.doc, cellPos('1'), cellPos('4'));
    view.dispatch(view.state.tr.setSelection(sel));
    expect(marker()?.style.display).toBe('none');
  });

  it('hides on an empty selection', async () => {
    const { handle } = await mountEditor('Hello world.\n');
    const view = handle.getView();
    view.hasFocus = () => true;
    mountCommentMarker(view);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 3, 3)));
    expect(marker()?.style.display).toBe('none');
  });
});
