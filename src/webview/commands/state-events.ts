import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

/**
 * Fires after every editor state update so front-ends (the toolbar) can reflect the
 * cursor's current marks/block — Principle 3: buttons reflect the cursor's state.
 */
type Listener = (view: EditorView) => void;
const listeners = new Set<Listener>();

export function onEditorUpdate(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const key = new PluginKey('omd-state-events');

export const stateEventsPlugin = $prose(
  () =>
    new Plugin({
      key,
      view: (view) => ({
        update: () => listeners.forEach((fn) => fn(view))
      })
    })
);
