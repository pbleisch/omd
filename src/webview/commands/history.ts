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
export const historyPlugin = $prose(() => history());

export const historyKeymap = $prose(() =>
  keymap({
    'Mod-z': undo,
    'Mod-y': redo,
    'Mod-Shift-z': redo
  })
);
