import { nodesCtx } from '@milkdown/core';
import type { MilkdownPlugin } from '@milkdown/ctx';
import type {
  JSONRecord,
  MarkdownNode,
  NodeSchema
} from '@milkdown/transformer';
import { $remark } from '@milkdown/utils';
import type { Join } from 'mdast-util-to-markdown';

/**
 * Preserve a writer's choice to put two flow blocks on consecutive source lines (#11).
 *
 * mdast records source positions, but not whether the separator between flow siblings had
 * a blank line. remark-stringify therefore inserts one unconditionally at the root and in
 * blockquotes, turning `> [!NOTE]\n> - item` into `> [!NOTE]\n>\n> - item` on the first
 * edit anywhere in the document.
 *
 * The parse transform derives that missing boundary bit from source positions. The schema
 * patch carries it as a ProseMirror attr on the right-hand block, then restores it on the
 * serialized mdast node. `tightFlowJoin` is remark-stringify's supported join seam: it
 * emits one newline rather than a blank line only for a boundary the source proved tight.
 *
 * The carried value is the *mdast type of the left sibling the source proved tight against*,
 * never a bare "I am tight" flag. A ProseMirror attr is sticky: Alt+Arrow moves the node
 * object verbatim (`commands/move-block.ts`), Enter copies it to the split half, and a paste
 * carries it into a document that never had the boundary. A bare flag would then emit a
 * single newline between two paragraphs, which reparses as *one* paragraph — the exact
 * round-trip loss this plugin exists to prevent. Matching the type against the actual left
 * sibling at serialization time makes the boundary self-validating: a relocated node only
 * stays tight beside the kind of neighbour it was proven tight beside.
 */

const ATTR = 'omdTightBefore';
const DATA = 'omdTightBefore';

type TightNode = MarkdownNode & { data?: Record<string, unknown> };

/** The mdast type the source proved this node can sit tight against, if any. */
function tightLeftType(node: MarkdownNode): string | null {
  const carried = (node as TightNode).data?.[DATA];
  return typeof carried === 'string' && carried.length > 0 ? carried : null;
}

function markTightBoundaries(node: MarkdownNode): void {
  const children = node.children;
  if (!children) return;

  for (let index = 1; index < children.length; index++) {
    const left = children[index - 1];
    const right = children[index];
    const adjacent = right.position?.start.line === (left.position?.end.line ?? -1) + 1;

    // `paragraph\n***` must keep a blank separator on output: OMD's canonical `---`
    // would otherwise reparse as a setext heading and destroy the thematic break. Do not
    // even carry a tightness attr for that unsafe boundary, so parse-stability comparisons
    // see the same document metadata before and after the safety normalization.
    if (adjacent && right.type !== 'thematicBreak') {
      const tight = right as TightNode;
      tight.data = { ...tight.data, [DATA]: left.type };
    }
  }

  for (const child of children) markTightBoundaries(child);
}

/** Position-derived parse state, registered after OMD's other mdast transforms. */
export const remarkTightFlow = $remark(
  'omd-tight-flow',
  () =>
    (() => (tree: MarkdownNode) => {
      markTightBoundaries(tree);
    }) as never
);

function withTightParseState(schema: NodeSchema): NodeSchema['parseMarkdown'] {
  const base = schema.parseMarkdown;
  return {
    ...base,
    runner: (state, node, type) => {
      const leftType = tightLeftType(node);
      if (!leftType) {
        base.runner(state, node, type);
        return;
      }

      let pending = true;
      const openNode = state.openNode;
      const addNode = state.addNode;
      state.openNode = (nodeType, attrs) => {
        if (pending && nodeType === type) {
          pending = false;
          return openNode(nodeType, { ...attrs, [ATTR]: leftType });
        }
        return openNode(nodeType, attrs);
      };
      state.addNode = (nodeType, attrs, content) => {
        if (pending && nodeType === type) {
          pending = false;
          return addNode(nodeType, { ...attrs, [ATTR]: leftType }, content);
        }
        return addNode(nodeType, attrs, content);
      };

      try {
        base.runner(state, node, type);
      } finally {
        state.openNode = openNode;
        state.addNode = addNode;
      }
    }
  };
}

function tightProps(props: JSONRecord | undefined, leftType: string): JSONRecord {
  const data = props?.data;
  const prior = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  return { ...props, data: { ...prior, [DATA]: leftType } } as JSONRecord;
}

function withTightSerializeState(schema: NodeSchema): NodeSchema['toMarkdown'] {
  const base = schema.toMarkdown;
  return {
    ...base,
    runner: (state, node) => {
      const leftType = node.attrs[ATTR];
      if (typeof leftType !== 'string' || leftType.length === 0) {
        base.runner(state, node);
        return;
      }

      let pending = true;
      const openNode = state.openNode;
      const addNode = state.addNode;
      state.openNode = (type, value, props) => {
        if (pending) {
          pending = false;
          return openNode(type, value, tightProps(props, leftType));
        }
        return openNode(type, value, props);
      };
      state.addNode = (type, children, value, props) => {
        if (pending) {
          pending = false;
          return addNode(type, children, value, tightProps(props, leftType));
        }
        return addNode(type, children, value, props);
      };

      try {
        base.runner(state, node);
      } finally {
        state.openNode = openNode;
        state.addNode = addNode;
      }
    }
  };
}

function patchBlockSchema(schema: NodeSchema): NodeSchema {
  if (!schema.group?.split(/\s+/).includes('block')) return schema;
  return {
    ...schema,
    attrs: {
      ...schema.attrs,
      [ATTR]: { default: '', validate: 'string' }
    },
    parseMarkdown: withTightParseState(schema),
    toMarkdown: withTightSerializeState(schema)
  };
}

/**
 * Add the carrier attr in place, after every node schema has registered.
 *
 * Re-registering `paragraphSchema.extendSchema(...)` removes `paragraph` from its preset
 * slot and appends it to `nodesCtx`. That silently changes ProseMirror's default block type
 * to `table`, breaking empty documents and table deletion. Mapping the existing entries
 * preserves their order while covering every core, GFM, and OMD block schema.
 */
export const tightFlowSchemas: MilkdownPlugin = (ctx) => () => {
  ctx.update(nodesCtx, (nodes) =>
    nodes.map(([name, schema]) => [name, patchBlockSchema(schema)] as [string, NodeSchema])
  );
};

type FlowNode = Parameters<Join>[0];
type ListNode = Extract<FlowNode, { type: 'list' }>;

/**
 * Does this list's first output line carry nothing but its marker?
 *
 * `plugins/stringify-handlers.ts` deliberately writes an item with no content as a bare `-`
 * or `1.` (#32), and the writer reaches that state from a tight boundary by selecting the
 * only item's text and deleting it.
 */
function startsWithBareMarker(list: ListNode): boolean {
  const first = list.children?.[0]?.children?.[0];
  if (!first) return true;
  if (first.type !== 'paragraph') return false;
  const only = first.children?.length === 1 ? first.children[0] : undefined;
  return !first.children?.length || (only?.type === 'html' && only.value.trim() === '<br />');
}

/**
 * CommonMark's rule for what may follow a paragraph on the very next line: another paragraph
 * is absorbed as a lazy continuation, and a list starts a new construct only when its first
 * item has content and, when ordered, it counts from 1. Every marked boundary satisfied this
 * at parse time — that is why it was marked — but the attr rides through edits that end it,
 * so the seam re-derives the answer from the nodes actually being written. `alpha\n- a` whose
 * item is emptied would otherwise be written `alpha\n-`, which is a setext underline: the
 * file reopens as one heading with the list gone.
 */
function interruptsParagraph(right: FlowNode): boolean {
  if (right.type !== 'list') return right.type !== 'paragraph';
  if (startsWithBareMarker(right)) return false;
  return !right.ordered || right.start == null || right.start === 1;
}

/** remark-stringify join rule for a boundary proven tight by the original source. */
export const tightFlowJoin: Join = (left, right) => {
  const leftType = tightLeftType(right as MarkdownNode);
  if (!leftType) return;
  // The attr rides with its node through moves, splits and pastes, so the neighbour here is
  // not necessarily the one the source proved tight. Only a matching left sibling can keep
  // the seam; anything else falls back to the blank line remark-stringify would emit.
  if (leftType !== left.type) return;
  // `---` one newline after any block is that block's setext underline, whatever the source
  // proved. The parse transform already refuses to mark this pair; so does the seam.
  if (right.type === 'thematicBreak') return;
  if (left.type === 'paragraph' && !interruptsParagraph(right)) return;
  // Two lists of the same flavour one newline apart are one list unless their markers
  // differ, and only mdast-util-to-markdown's own bullet alternation makes them differ.
  // Two document nodes are worth more than a seam that rests on a serializer internal, so
  // hand this boundary back to remark-stringify. Differing flavours cannot merge, and keep
  // their seam.
  if (
    left.type === 'list' &&
    right.type === 'list' &&
    Boolean(left.ordered) === Boolean(right.ordered)
  ) {
    return;
  }
  return 0;
};
