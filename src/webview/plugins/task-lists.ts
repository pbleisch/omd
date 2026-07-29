import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from 'prosemirror-state';

/**
 * Make GFM task-list checkboxes real. Milkdown tags a task item with
 * data-item-type="task" and data-checked, but renders no control. We draw the checkbox
 * in CSS (see styles.css) and toggle it here: a click in the checkbox gutter flips the
 * `checked` attr, which the GFM serializer writes back as `[x]` / `[ ]`.
 *
 * Toggling is one deliberate act on the object, not hand-editing `[x]` characters
 * (Principle 3). We use a native DOM listener rather than ProseMirror's handleClickOn
 * because the checkbox sits in the item's padding gutter, where handleClickOn does not
 * fire.
 */
const key = new PluginKey('omd-task-lists');

// The clickable gutter width to the left of a task item's content, in px.
const GUTTER = 22;

/** Toggle the `checked` attr of the list_item at `liPos`. Exported for tests. */
export function toggleTaskAt(
  state: import('prosemirror-state').EditorState,
  liPos: number
): import('prosemirror-state').Transaction | null {
  const node = state.doc.nodeAt(liPos);
  if (!node || node.type.name !== 'list_item') return null;
  const current = node.attrs.checked;
  const next = !(current === true || current === 'true');
  return state.tr.setNodeMarkup(liPos, undefined, { ...node.attrs, checked: next });
}

export const taskListPlugin = $prose(
  () =>
    new Plugin({
      key,
      view(view) {
        const onMouseDown = (event: MouseEvent) => {
          const target = event.target as HTMLElement | null;
          const li = target?.closest('li[data-item-type="task"]') as HTMLElement | null;
          if (!li) return;

          const rect = li.getBoundingClientRect();
          if (event.clientX > rect.left + GUTTER) return; // click was on the text, ignore

          const liPos = view.posAtDOM(li, 0) - 1; // position of the list_item node
          const tr = toggleTaskAt(view.state, liPos);
          if (!tr) return;

          event.preventDefault(); // don't move the selection into the item
          view.dispatch(tr);
        };
        view.dom.addEventListener('mousedown', onMouseDown);
        return {
          destroy() {
            view.dom.removeEventListener('mousedown', onMouseDown);
          }
        };
      }
    })
);
