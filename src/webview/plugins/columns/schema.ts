import { $nodeSchema, $remark } from '@milkdown/utils';
import type { MdNode } from '../shortcode/transform';
import { transformColumns } from './transform';

/**
 * The `columns` / `column` schema nodes backing `2col` and `3col`. The table delimiters are
 * kept verbatim in attrs and re-emitted, so the construct round-trips byte-for-byte.
 *
 * Empty cells are written as `&nbsp;` (docs/design/FORMATS.md) — and they have to be written by *us*
 * as raw html, because remark decodes the entity to a literal non-breaking space on the way
 * in. Treating a cell that holds nothing but that character as empty, and re-emitting the
 * entity, is what keeps an empty column byte-stable across a round-trip.
 */

/** True when a column holds no real content (blank, or just the decoded `&nbsp;`). */
function isBlankColumn(node: { textContent: string }): boolean {
  return node.textContent.replace(/ /g, '').trim() === '';
}

export const remarkColumns = $remark('omd-columns', () => () => (tree: MdNode) => {
  transformColumns(tree);
});

export const columnsSchema = $nodeSchema('columns', () => ({
  group: 'block',
  content: 'column+',
  defining: true,
  attrs: { openRaw: { default: '<table><tr><td>' }, closeRaw: { default: '</td></tr></table>' } },
  parseDOM: [{ tag: 'div[data-omd-columns]' }],
  toDOM: (node) => [
    'div',
    { class: 'omd-columns', 'data-omd-columns': '', 'data-count': String(node.childCount) },
    0
  ],
  parseMarkdown: {
    match: ({ type }) => type === 'omdColumns',
    runner: (state, node, type) => {
      state.openNode(type, {
        openRaw: node.openRaw as string,
        closeRaw: node.closeRaw as string
      });
      state.next((node.children ?? []) as MdNode[]);
      state.closeNode();
    }
  },
  toMarkdown: {
    match: (node) => node.type.name === 'columns',
    runner: (state, node) => {
      state.addNode('html', undefined, node.attrs.openRaw as string);
      state.next(node.content);
      state.addNode('html', undefined, node.attrs.closeRaw as string);
    }
  }
}));

export const columnSchema = $nodeSchema('column', () => ({
  content: 'block+',
  defining: true,
  attrs: { sepRaw: { default: '' } },
  parseDOM: [{ tag: 'div[data-omd-column]' }],
  toDOM: () => ['div', { class: 'omd-column', 'data-omd-column': '' }, 0],
  parseMarkdown: {
    match: ({ type }) => type === 'omdColumn',
    runner: (state, node, type) => {
      state.openNode(type, { sepRaw: node.sepRaw as string });
      const children = (node.children ?? []) as MdNode[];
      // `block+` needs at least one child; an empty cell arrives with none.
      state.next(children.length ? children : [{ type: 'paragraph', children: [] }]);
      state.closeNode();
    }
  },
  toMarkdown: {
    match: (node) => node.type.name === 'column',
    runner: (state, node) => {
      const sep = node.attrs.sepRaw as string;
      if (sep) state.addNode('html', undefined, sep);
      if (isBlankColumn(node)) state.addNode('html', undefined, '&nbsp;');
      else state.next(node.content);
    }
  }
}));
