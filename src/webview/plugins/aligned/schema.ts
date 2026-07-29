import { $nodeSchema, $remark } from '@milkdown/utils';
import type { MdNode } from '../shortcode/transform';
import { transformAligned } from './transform';

/**
 * The `aligned` schema node — an image (or other block content) wrapped in a
 * `<div align="…">`. OMD renders the alignment; GitHub renders the same div natively, so the
 * content is visible either way (docs/design/FORMATS.md). The div bytes live in attrs and re-emit
 * verbatim so the construct round-trips.
 */

export const remarkAligned = $remark('omd-aligned', () => () => (tree: MdNode) => {
  transformAligned(tree);
});

export const alignedSchema = $nodeSchema('aligned', () => ({
  group: 'block',
  content: 'block+',
  defining: true,
  attrs: {
    align: { default: 'center' },
    openRaw: { default: '' },
    closeRaw: { default: '' }
  },
  parseDOM: [
    {
      tag: 'div[data-align]',
      getAttrs: (dom) => ({ align: (dom as HTMLElement).dataset.align ?? 'center' })
    }
  ],
  toDOM: (node) => [
    'div',
    { class: `omd-aligned omd-aligned--${node.attrs.align}`, 'data-align': node.attrs.align },
    0
  ],
  parseMarkdown: {
    match: ({ type }) => type === 'omdAligned',
    runner: (state, node, type) => {
      state.openNode(type, {
        align: node.align as string,
        openRaw: node.openRaw as string,
        closeRaw: node.closeRaw as string
      });
      state.next((node.children ?? []) as MdNode[]);
      state.closeNode();
    }
  },
  toMarkdown: {
    match: (node) => node.type.name === 'aligned',
    runner: (state, node) => {
      state.addNode('html', undefined, node.attrs.openRaw as string);
      state.next(node.content);
      state.addNode('html', undefined, node.attrs.closeRaw as string);
    }
  }
}));
