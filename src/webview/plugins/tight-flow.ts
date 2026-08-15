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
 */

const ATTR = 'omdTightBefore';
const DATA = 'omdTightBefore';

type TightNode = MarkdownNode & { data?: Record<string, unknown> };

function isTight(node: MarkdownNode): boolean {
  return Boolean((node as TightNode).data?.[DATA]);
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
      tight.data = { ...tight.data, [DATA]: true };
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
      if (!isTight(node)) {
        base.runner(state, node, type);
        return;
      }

      let pending = true;
      const openNode = state.openNode;
      const addNode = state.addNode;
      state.openNode = (nodeType, attrs) => {
        if (pending && nodeType === type) {
          pending = false;
          return openNode(nodeType, { ...attrs, [ATTR]: true });
        }
        return openNode(nodeType, attrs);
      };
      state.addNode = (nodeType, attrs, content) => {
        if (pending && nodeType === type) {
          pending = false;
          return addNode(nodeType, { ...attrs, [ATTR]: true }, content);
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

function tightProps(props?: JSONRecord): JSONRecord {
  const data = props?.data;
  const prior = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  return { ...props, data: { ...prior, [DATA]: true } } as JSONRecord;
}

function withTightSerializeState(schema: NodeSchema): NodeSchema['toMarkdown'] {
  const base = schema.toMarkdown;
  return {
    ...base,
    runner: (state, node) => {
      if (node.attrs[ATTR] !== true) {
        base.runner(state, node);
        return;
      }

      let pending = true;
      const openNode = state.openNode;
      const addNode = state.addNode;
      state.openNode = (type, value, props) => {
        if (pending) {
          pending = false;
          return openNode(type, value, tightProps(props));
        }
        return openNode(type, value, props);
      };
      state.addNode = (type, children, value, props) => {
        if (pending) {
          pending = false;
          return addNode(type, children, value, tightProps(props));
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
      [ATTR]: { default: false, validate: 'boolean' }
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

/** remark-stringify join rule for a boundary proven tight by the original source. */
export const tightFlowJoin: Join = (_left, right) => {
  if (!isTight(right as MarkdownNode)) return;
  // Defense in depth for attrs created by an edit rather than the parse transform.
  if (right.type === 'thematicBreak') return;
  return 0;
};
