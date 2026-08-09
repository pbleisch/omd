import { Fragment, Mark, type Node as ProseNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';

/**
 * Apply a host-pushed document as the narrowest edit that turns the current doc into it,
 * instead of replacing the whole thing.
 *
 * Replacing the whole document re-parses and re-renders every block: each node view
 * (diagram, chart, callout, code block) is torn down and rebuilt, and the selection and
 * scroll position go with it. On screen that reads as the content being pasted back into
 * place — the flash in #7. The push itself is legitimate and has to be applied; it just
 * must not repaint blocks that did not change.
 *
 * The walk is a common-prefix/common-suffix scan at each level. When exactly one child
 * differs on both sides and the two are the same kind of node, it descends into that child,
 * so a one-character change deep inside a list ends up as a one-character replacement rather
 * than a new list.
 */
export function diffDocument(current: ProseNode, next: ProseNode, tr: Transaction): boolean {
  if (nodesEqual(current, next)) return false;
  return diffContent(current, next, 0, tr);
}

/**
 * Attributes the markdown parser cannot know, because the editor derives them from the
 * document once it is in the state. Milkdown fills heading ids in from the heading's text in
 * a view plugin (`syncHeadingIdPlugin`), so a freshly parsed document always carries the
 * schema default where the live one carries the slug. Treating that as a change would rebuild
 * every heading on every push, for a value the editor recomputes a moment later anyway.
 *
 * `heading.id` is the only such attribute in this schema — checked by parsing the repo's
 * corpus, showcase, design docs and integration fixtures and comparing every attribute of
 * every node against the mounted document.
 */
const DERIVED_ATTRS: Readonly<Record<string, readonly string[]>> = { heading: ['id'] };

/** True when the incoming node leaves a derived attribute at its schema default. */
function isUnset(node: ProseNode, key: string): boolean {
  if (!DERIVED_ATTRS[node.type.name]?.includes(key)) return false;
  return node.attrs[key] === node.type.spec.attrs?.[key]?.default;
}

function attrsEqual(a: ProseNode, b: ProseNode): boolean {
  for (const key of Object.keys(a.attrs)) {
    if (a.attrs[key] === b.attrs[key]) continue;
    if (isUnset(b, key)) continue;
    if (JSON.stringify(a.attrs[key]) !== JSON.stringify(b.attrs[key])) return false;
  }
  return true;
}

/** `Node.eq`, but forgiving of the attributes the editor derives rather than parses. */
function nodesEqual(a: ProseNode, b: ProseNode): boolean {
  if (a === b) return true;
  if (a.type !== b.type || !Mark.sameSet(a.marks, b.marks)) return false;
  if (a.isText || b.isText) return a.isText && b.isText && a.text === b.text;
  if (!attrsEqual(a, b)) return false;
  if (a.childCount !== b.childCount) return false;
  for (let i = 0; i < a.childCount; i++) {
    if (!nodesEqual(a.child(i), b.child(i))) return false;
  }
  return true;
}

/** True when two non-text nodes are the same shape, so descending into them is meaningful. */
function sameShape(a: ProseNode, b: ProseNode): boolean {
  if (a.isText || b.isText || a.type !== b.type) return false;
  if (!Mark.sameSet(a.marks, b.marks)) return false;
  return attrsEqual(a, b);
}

/** A trailing surrogate: splitting a pair here would produce a lone half. */
const isLowSurrogate = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff;

/**
 * Diff `a`'s children against `b`'s, where `a`'s content starts at document position
 * `base`, and record the narrowest replacement in `tr`. Returns false when they match.
 */
function diffContent(a: ProseNode, b: ProseNode, base: number, tr: Transaction): boolean {
  const ac = a.content;
  const bc = b.content;

  let start = 0;
  const shared = Math.min(ac.childCount, bc.childCount);
  while (start < shared && nodesEqual(ac.child(start), bc.child(start))) start++;

  let endA = ac.childCount;
  let endB = bc.childCount;
  while (endA > start && endB > start && nodesEqual(ac.child(endA - 1), bc.child(endB - 1))) {
    endA--;
    endB--;
  }
  if (start === endA && start === endB) return false;

  let from = base;
  for (let i = 0; i < start; i++) from += ac.child(i).nodeSize;

  if (endA - start === 1 && endB - start === 1) {
    const childA = ac.child(start);
    const childB = bc.child(start);
    // Same text run, edited: replace only the characters that actually changed, so a
    // cursor elsewhere in the block does not move.
    if (childA.isText && childB.isText && Mark.sameSet(childA.marks, childB.marks)) {
      return diffText(childA.text ?? '', childB.text ?? '', from, childA, tr);
    }
    // Same kind of block: descend past its opening token and diff its children.
    if (sameShape(childA, childB)) return diffContent(childA, childB, from + 1, tr);
  }

  let to = from;
  for (let i = start; i < endA; i++) to += ac.child(i).nodeSize;
  const replacement: ProseNode[] = [];
  for (let i = start; i < endB; i++) replacement.push(bc.child(i));
  tr.replaceWith(from, to, Fragment.fromArray(replacement));
  return true;
}

/** Replace only the changed run inside one text node (`from` is the node's start). */
function diffText(
  before: string,
  after: string,
  from: number,
  node: ProseNode,
  tr: Transaction
): boolean {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) {
    prefix++;
  }
  while (prefix > 0 && isLowSurrogate(before.charCodeAt(prefix))) prefix--;

  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix++;
  }
  while (suffix > 0 && isLowSurrogate(before.charCodeAt(before.length - suffix))) suffix--;

  const cutFrom = from + prefix;
  const cutTo = from + before.length - suffix;
  const inserted = after.slice(prefix, after.length - suffix);
  if (inserted) tr.replaceWith(cutFrom, cutTo, node.type.schema.text(inserted, node.marks));
  else tr.delete(cutFrom, cutTo);
  return true;
}
