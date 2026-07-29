import { $nodeSchema, $remark } from '@milkdown/utils';
import remarkFrontmatter from 'remark-frontmatter';

/**
 * YAML front matter as a real schema node (Phase 6). Without this the editor treats a
 * leading `---` block as a thematic break + prose and corrupts it on save; remark-frontmatter
 * tokenizes the fenced block into a single `yaml` mdast node whose text is captured raw, so
 * it round-trips byte-for-byte (Principle 2). The YAML lives in a `value` attr on an atom
 * node the NodeView renders; the property panel edits it.
 */

// Registers remark-frontmatter on Milkdown's shared processor for both parse and stringify.
// Milkdown applies remark plugins with an empty `{}` options object, which remark-frontmatter
// rejects ("Missing type in matter {}") since it reads options as a matter preset — so this
// attacher pins the `yaml` preset itself and ignores whatever Milkdown passes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const remarkFrontmatterPlugin = $remark('omd-remark-frontmatter', () => function (this: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (remarkFrontmatter as any).call(this, ['yaml']);
} as never);

export const frontmatterSchema = $nodeSchema('frontmatter', () => ({
  group: 'block',
  atom: true,
  selectable: true,
  attrs: { value: { default: '' } },
  parseDOM: [
    {
      tag: 'div[data-type="frontmatter"]',
      getAttrs: (dom) => ({ value: (dom as HTMLElement).dataset.value ?? '' })
    }
  ],
  toDOM: (node) => [
    'div',
    { 'data-type': 'frontmatter', 'data-value': node.attrs.value },
    node.attrs.value
  ],
  parseMarkdown: {
    match: ({ type }) => type === 'yaml',
    runner: (state, node, type) => {
      state.addNode(type, { value: node.value as string });
    }
  },
  toMarkdown: {
    match: (node) => node.type.name === 'frontmatter',
    runner: (state, node) => {
      state.addNode('yaml', undefined, node.attrs.value as string);
    }
  }
}));
