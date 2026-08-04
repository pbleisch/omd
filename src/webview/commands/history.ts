import { $prose } from '@milkdown/utils';
import { history, undo, redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';

/**
 * Undo/redo history. Milkdown's commonmark preset ships no history plugin, so OMD owns one
 * — and it must come from the same `prosemirror-history` module the registry's undo/redo
 * commands import, or their plugin key wouldn't match this instance and the toolbar buttons
 * would be inert. The keymap binds the usual chords; the toolbar drives the same `undo`/
 * `redo` (Principle 4).
 */
export const historyPlugin = $prose(() =>
  history({
    // Tighter grouping window so rapid edits on separate lines are less likely to be merged
    // into a single undo step. The default 500ms means two edits half a second apart undo
    // as one, which feels like "undo undoes multiple things".
    timeThreshold: 200
  })
);

export const historyKeymap = $prose(() =>
  keymap({
    'Mod-z': undo,
    'Mod-y': redo,
    'Mod-Shift-z': redo
  })
);
