import { Fragment, type Node as PMNode } from 'prosemirror-model';
import { Plugin, PluginKey, type EditorState, type Transaction } from 'prosemirror-state';
import { $prose } from '@milkdown/utils';

/**
 * Adjacent same-type list nodes are not a stable Markdown document state (#22).
 *
 * Parsing always coalesces them, but a ProseMirror edit can create them by deleting or
 * moving the block that separated two lists. remark-stringify can only keep them distinct
 * by changing the second marker (`-` -> `*`, `1.` -> `1)`), producing unrelated diff noise.
 * The product decision is to merge the lists in the document model instead. Ordered list
 * numbering therefore continues across the boundary; a writer who wants distinct lists can
 * split them again.
 */

const LIST_TYPES = new Set(['bullet_list', 'ordered_list']);
const key = new PluginKey('omd-list-adjacency');

interface Merge {
  from: number;
  to: number;
  lists: PMNode[];
}

/** Find one innermost adjacent-list run. Repeated append transactions handle the rest. */
function findMerge(parent: PMNode, contentStart = 0): Merge | null {
  let offset = 0;
  for (let index = 0; index < parent.childCount; index++) {
    const child = parent.child(index);
    if (!child.isLeaf) {
      const nested = findMerge(child, contentStart + offset + 1);
      if (nested) return nested;
    }
    offset += child.nodeSize;
  }

  offset = 0;
  for (let index = 0; index < parent.childCount; ) {
    const first = parent.child(index);
    if (!LIST_TYPES.has(first.type.name)) {
      offset += first.nodeSize;
      index++;
      continue;
    }

    const lists = [first];
    let size = first.nodeSize;
    let next = index + 1;
    while (next < parent.childCount && parent.child(next).type === first.type) {
      const sibling = parent.child(next);
      lists.push(sibling);
      size += sibling.nodeSize;
      next++;
    }
    if (lists.length > 1) return { from: contentStart + offset, to: contentStart + offset + size, lists };

    offset += size;
    index = next;
  }
  return null;
}

function isLoose(value: unknown): boolean {
  return value === true || value === 'true';
}

function mergedList(lists: PMNode[]): PMNode {
  const first = lists[0];
  const attrs: Record<string, unknown> = {
    ...first.attrs,
    // Milkdown's list schemas currently store this attr as the strings "true"/"false".
    // Match the parser's representation so a merged document reopens to the same model;
    // tight-lists.ts converts it back to a real mdast boolean at serialization time.
    spread: lists.some((list) => isLoose(list.attrs.spread)) ? 'true' : 'false'
  };
  let items = lists.flatMap((list) => Array.from({ length: list.childCount }, (_, i) => list.child(i)));

  // Keep the model's cached item labels coherent with the numbering the merged <ol> shows.
  // The serializer numbers from the list's `order`; nested sublists remain untouched.
  if (first.type.name === 'ordered_list') {
    const order = Number(attrs.order ?? 1);
    items = items.map((item, index) =>
      item.type.create(
        { ...item.attrs, label: `${order + index}.`, listType: 'ordered' },
        item.content,
        item.marks
      )
    );
  }

  return first.type.create(attrs, Fragment.fromArray(items), first.marks);
}

export function mergeAdjacentLists(state: EditorState): Transaction | null {
  const merge = findMerge(state.doc);
  if (!merge) return null;
  return state.tr.replaceWith(merge.from, merge.to, mergedList(merge.lists));
}

export const listAdjacencyPlugin = $prose(
  () =>
    new Plugin({
      key,
      appendTransaction(transactions, _oldState, newState) {
        if (!transactions.some((transaction) => transaction.docChanged)) return null;
        return mergeAdjacentLists(newState);
      }
    })
);
