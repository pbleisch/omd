import type { Node as PMNode } from 'prosemirror-model';
import { Plugin, PluginKey, type EditorState, type Transaction } from 'prosemirror-state';
import { canJoin } from 'prosemirror-transform';
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
 *
 * Two properties shape the implementation. The merge is expressed as `join` steps at the
 * seams rather than one replacement of the whole run, because a replacement maps every
 * position inside it to its end — the caret the writer just left at the junction would jump
 * to the bottom of the merged list. And the scan is limited to the ranges the transactions
 * actually rewrote: adjacency can only appear where something was removed, so an ordinary
 * keystroke inspects one ancestor chain instead of walking a whole 30KB document.
 */

const LIST_TYPES = new Set(['bullet_list', 'ordered_list']);
const key = new PluginKey('omd-list-adjacency');

/** A run of two or more adjacent same-type lists, positioned in the document it was found in. */
interface Run {
  from: number;
  to: number;
  lists: PMNode[];
}

/** Every run of adjacent same-type lists directly under `parent`. */
function runsIn(parent: PMNode, parentStart: number): Run[] {
  const runs: Run[] = [];
  let offset = 0;
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
    if (lists.length > 1) {
      runs.push({ from: parentStart + offset, to: parentStart + offset + size, lists });
    }

    offset += size;
    index = next;
  }
  return runs;
}

/**
 * The parts of the new document these transactions rewrote, in new-document positions.
 * Each step map's own output is carried forward through the rest of its transaction and
 * through every later transaction, so the ranges all describe `newState.doc`.
 */
function touchedRanges(transactions: readonly Transaction[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  transactions.forEach((transaction, index) => {
    transaction.mapping.maps.forEach((map, mapIndex) => {
      const rest = transaction.mapping.slice(mapIndex + 1);
      map.forEach((_oldFrom, _oldTo, newFrom, newTo) => {
        let from = rest.map(newFrom, -1);
        let to = rest.map(newTo, 1);
        for (let later = index + 1; later < transactions.length; later++) {
          from = transactions[later].mapping.map(from, -1);
          to = transactions[later].mapping.map(to, 1);
        }
        ranges.push([from, to]);
      });
    });
  });
  return ranges;
}

/**
 * The runs reachable from the touched ranges — the ancestor chain of each range endpoint,
 * skipping textblocks, whose children are inline and can never be lists.
 */
function runsNear(doc: PMNode, ranges: Array<[number, number]>): Run[] {
  const found = new Map<number, Run>();
  for (const [from, to] of ranges) {
    for (const pos of from === to ? [from] : [from, to]) {
      const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
      for (let depth = $pos.depth; depth >= 0; depth--) {
        const parent = $pos.node(depth);
        if (parent.inlineContent) continue;
        for (const run of runsIn(parent, $pos.start(depth))) found.set(run.from, run);
      }
    }
  }
  return Array.from(found.values());
}

function isLoose(value: unknown): boolean {
  return value === true || value === 'true';
}

/**
 * Runs that can be merged in one transaction: sorted last-first so each join leaves the
 * positions of the runs still to come untouched, and with any run overlapping one already
 * taken dropped. A dropped run is always the outer half of a nesting pair, and the joins
 * applied inside it put its own parent back in the next append's touched ranges.
 */
function disjointRuns(runs: Run[]): Run[] {
  const taken: Run[] = [];
  for (const run of runs.sort((a, b) => b.from - a.from)) {
    if (taken.some((other) => run.from < other.to && other.from < run.to)) continue;
    taken.push(run);
  }
  return taken;
}

/** Join one run's seams and reconcile the attrs the merged list now owns. */
function mergeRun(tr: Transaction, run: Run): boolean {
  const seams: number[] = [];
  let pos = run.from;
  for (let index = 0; index < run.lists.length - 1; index++) {
    pos += run.lists[index].nodeSize;
    seams.push(pos);
  }
  if (!seams.every((seam) => canJoin(tr.doc, seam))) return false;
  for (let index = seams.length - 1; index >= 0; index--) tr.join(seams[index]);

  // Milkdown's list schemas currently store this attr as the strings "true"/"false".
  // Match the parser's representation so a merged document reopens to the same model;
  // tight-lists.ts converts it back to a real mdast boolean at serialization time.
  const spread = run.lists.some((list) => isLoose(list.attrs.spread)) ? 'true' : 'false';
  const merged = tr.doc.nodeAt(run.from);
  if (!merged) return false;
  tr.setNodeMarkup(run.from, undefined, { ...merged.attrs, spread });

  // Keep the model's cached item labels coherent with the numbering the merged <ol> shows.
  // The serializer numbers from the list's `order`; nested sublists remain untouched.
  if (merged.type.name === 'ordered_list') {
    const order = Number(merged.attrs.order ?? 1);
    let itemPos = run.from + 1;
    for (let index = 0; index < merged.childCount; index++) {
      const item = merged.child(index);
      // `setNodeMarkup` keeps the node's size, so the running offset stays valid.
      tr.setNodeMarkup(itemPos, undefined, {
        ...item.attrs,
        label: `${order + index}.`,
        listType: 'ordered'
      });
      itemPos += item.nodeSize;
    }
  }
  return true;
}

export function mergeAdjacentLists(
  state: EditorState,
  ranges: Array<[number, number]>
): Transaction | null {
  const runs = disjointRuns(runsNear(state.doc, ranges));
  if (!runs.length) return null;

  const tr = state.tr;
  for (const run of runs) mergeRun(tr, run);
  return tr.steps.length ? tr : null;
}

export const listAdjacencyPlugin = $prose(
  () =>
    new Plugin({
      key,
      appendTransaction(transactions, _oldState, newState) {
        if (!transactions.some((transaction) => transaction.docChanged)) return null;
        return mergeAdjacentLists(newState, touchedRanges(transactions));
      }
    })
);
