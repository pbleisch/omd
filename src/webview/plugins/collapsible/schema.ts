import { $nodeSchema, $remark } from '@milkdown/utils';
import type { MdNode } from '../shortcode/transform';
import { transformDetails } from './transform';

/**
 * The `details` schema node — the native collapsible. OMD renders it as a real fold; GitHub
 * folds the same `<details>` natively. The delimiter bytes (including the `<summary>`) live
 * in attrs and re-emit verbatim, so the construct round-trips untouched.
 */

export const remarkDetails = $remark('omd-details', () => () => (tree: MdNode) => {
  transformDetails(tree);
});

export const detailsSchema = $nodeSchema('details', () => ({
  group: 'block',
  content: 'block+',
  defining: true,
  attrs: {
    summary: { default: '' },
    openByDefault: { default: false },
    openRaw: { default: '' },
    closeRaw: { default: '' }
  },
  parseDOM: [
    {
      tag: 'details',
      getAttrs: (dom) => ({
        summary: (dom as HTMLElement).querySelector('summary')?.textContent ?? '',
        openByDefault: (dom as HTMLElement).hasAttribute('open')
      })
    }
  ],
  toDOM: (node) => [
    'div',
    { class: 'omd-details', 'data-summary': node.attrs.summary },
    0
  ],
  parseMarkdown: {
    match: ({ type }) => type === 'omdDetails',
    runner: (state, node, type) => {
      state.openNode(type, {
        summary: node.summary as string,
        openByDefault: node.openByDefault as boolean,
        openRaw: node.openRaw as string,
        closeRaw: node.closeRaw as string
      });
      state.next((node.children ?? []) as MdNode[]);
      state.closeNode();
    }
  },
  toMarkdown: {
    match: (node) => node.type.name === 'details',
    runner: (state, node) => {
      state.addNode('html', undefined, node.attrs.openRaw as string);
      state.next(node.content);
      state.addNode('html', undefined, node.attrs.closeRaw as string);
    }
  }
}));
