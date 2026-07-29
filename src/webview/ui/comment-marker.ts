import type { EditorView } from 'prosemirror-view';
import { CellSelection } from 'prosemirror-tables';
import { onEditorUpdate } from '../commands/state-events';
import { openParamPopover } from './popover';
import { startThread } from '../blocks/thread-actions';
import { codicon } from '../codicons';

/**
 * The add-comment marker: an accent-filled button that appears beside a selection and starts a
 * thread on it. A monochrome `comment` codicon, so it reads as chrome and stays theme-aware
 * (docs/design/STYLE.md — chrome uses codicons, never emoji). Anyone reading can comment without
 * entering a mode (Principle 5).
 *
 * The marker is suppressed for a table `CellSelection`: a thread anchor is an inline HTML-comment
 * pair, which can't span table structure — wrapping a cell range would mangle the table. Text
 * inside a single cell still comments normally (that's a plain TextSelection).
 */
export function mountCommentMarker(view: EditorView): void {
  const marker = document.createElement('button');
  marker.type = 'button';
  marker.className = 'omd-comment-marker';
  marker.appendChild(codicon('comment'));
  marker.title = 'Comment on the selection';
  marker.style.display = 'none';
  document.body.appendChild(marker);

  marker.addEventListener('mousedown', (e) => {
    e.preventDefault();
    // Capture the selection before the popover takes focus.
    const coords = view.coordsAtPos(view.state.selection.to);
    openParamPopover({
      anchor: coords,
      label: 'Comment',
      value: '',
      onCommit: (body) => {
        if (body.trim()) startThread(view, body.trim());
      }
    });
  });

  const reposition = (v: EditorView) => {
    const { from, to, empty } = v.state.selection;
    // Empty, unfocused, or a multi-cell table selection → no marker (the last would corrupt the
    // table, since an inline anchor pair can't wrap across cells).
    if (empty || !v.hasFocus() || v.state.selection instanceof CellSelection) {
      marker.style.display = 'none';
      return;
    }
    const end = v.coordsAtPos(to);
    void from;
    marker.style.display = '';
    marker.style.left = `${end.right + 6}px`;
    marker.style.top = `${end.top - 4}px`;
  };

  onEditorUpdate(reposition);
}
