import { $nodeSchema, $remark } from '@milkdown/utils';
import type { MdNode } from './transform';
import { transformRoot } from './transform';

/**
 * Smart-block shortcodes as real schema nodes (the pattern the math node established).
 * A remark transformer folds the flat `html` comment siblings into `omdLeaf` /
 * `omdContainer` mdast nodes (see ./transform), which these schemas turn into ProseMirror
 * nodes and serialize back to the exact delimiter bytes (docs/design/FORMATS.md).
 *
 * The delimiter strings live in attrs and are emitted verbatim, so a shortcode round-trips
 * byte-for-byte; a container's body is real markdown nodes, so its inner headings, lists,
 * and fences are preserved rather than flattened.
 */

// Register the pairing transform on Milkdown's shared remark processor. Milkdown runs
// `remark.runSync` after parse, so this executes on every load.
export const remarkShortcode = $remark('omd-shortcode', () => () => (tree: MdNode) => {
  transformRoot(tree);
});

export const shortcodeLeafSchema = $nodeSchema('shortcode_leaf', () => ({
  group: 'block',
  atom: true,
  selectable: true,
  attrs: {
    name: { default: '' },
    params: { default: '{}' },
    /** The exact `<!-- omd:… -->` bytes, re-emitted verbatim on save. */
    raw: { default: '' }
  },
  parseDOM: [
    {
      tag: 'div[data-omd-leaf]',
      getAttrs: (dom) => {
        const el = dom as HTMLElement;
        return {
          name: el.dataset.name ?? '',
          params: el.dataset.params ?? '{}',
          raw: el.dataset.raw ?? ''
        };
      }
    }
  ],
  toDOM: (node) => [
    'div',
    {
      'data-omd-leaf': '',
      'data-name': node.attrs.name,
      'data-params': node.attrs.params,
      'data-raw': node.attrs.raw
    }
  ],
  parseMarkdown: {
    match: ({ type }) => type === 'omdLeaf',
    runner: (state, node, type) => {
      state.addNode(type, {
        name: node.name as string,
        params: node.params as string,
        raw: node.raw as string
      });
    }
  },
  toMarkdown: {
    match: (node) => node.type.name === 'shortcode_leaf',
    runner: (state, node) => {
      state.addNode('html', undefined, node.attrs.raw as string);
    }
  }
}));

export const shortcodeContainerSchema = $nodeSchema('shortcode_container', () => ({
  group: 'block',
  content: 'block+',
  defining: true,
  attrs: {
    name: { default: '' },
    params: { default: '{}' },
    openRaw: { default: '' },
    closeRaw: { default: '' },
    /** A chart's embedded preview SVG (generated artifact), emitted verbatim between the
     * opener and the body so it round-trips byte-for-byte. Empty for other containers. */
    svg: { default: '' }
  },
  parseDOM: [
    {
      tag: 'div[data-omd-container]',
      getAttrs: (dom) => {
        const el = dom as HTMLElement;
        return {
          name: el.dataset.name ?? '',
          params: el.dataset.params ?? '{}',
          openRaw: el.dataset.openRaw ?? '',
          closeRaw: el.dataset.closeRaw ?? ''
        };
      }
    }
  ],
  toDOM: (node) => [
    'div',
    {
      'data-omd-container': '',
      'data-name': node.attrs.name,
      'data-params': node.attrs.params,
      'data-open-raw': node.attrs.openRaw,
      'data-close-raw': node.attrs.closeRaw
    },
    0
  ],
  parseMarkdown: {
    match: ({ type }) => type === 'omdContainer',
    runner: (state, node, type) => {
      state.openNode(type, {
        name: node.name as string,
        params: node.params as string,
        openRaw: node.openRaw as string,
        closeRaw: node.closeRaw as string,
        svg: (node.svg as string) ?? ''
      });
      state.next((node.children ?? []) as MdNode[]);
      state.closeNode();
    }
  },
  toMarkdown: {
    match: (node) => node.type.name === 'shortcode_container',
    runner: (state, node) => {
      // Flat siblings on disk: opener html, [preview svg], real-markdown body, closer html.
      state.addNode('html', undefined, node.attrs.openRaw as string);
      const svg = node.attrs.svg as string;
      if (svg) state.addNode('html', undefined, svg);
      state.next(node.content);
      state.addNode('html', undefined, node.attrs.closeRaw as string);
    }
  }
}));
