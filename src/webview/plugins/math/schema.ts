import { $nodeSchema, $remark } from '@milkdown/utils';
import remarkMath from 'remark-math';

/**
 * Math as real schema nodes, not decorations. remark-math tokenizes `$…$` / `$$…$$`
 * with micromark, so the LaTeX is captured raw — markdown escape rules never touch it,
 * and it round-trips byte-for-byte (Principle 2). (A decoration overlay can't do this:
 * markdown parsing would mangle `\,` and `\int_` inside the "prose".) The tex lives in a
 * `value` attr on an atom node; the NodeView renders it with KaTeX.
 */

// Registers remark-math on Milkdown's shared remark processor, enabling both parse
// (mdast inlineMath/math) and stringify (mdast-util-math) of math.
export const remarkMathPlugin = $remark('omd-remark-math', () => remarkMath);

export const mathInlineSchema = $nodeSchema('math_inline', () => ({
  group: 'inline',
  inline: true,
  atom: true,
  attrs: { value: { default: '' } },
  selectable: true,
  parseDOM: [
    {
      tag: 'span[data-type="math-inline"]',
      getAttrs: (dom) => ({ value: (dom as HTMLElement).dataset.value ?? '' })
    }
  ],
  toDOM: (node) => [
    'span',
    { 'data-type': 'math-inline', 'data-value': node.attrs.value },
    node.attrs.value
  ],
  parseMarkdown: {
    match: ({ type }) => type === 'inlineMath',
    runner: (state, node, type) => {
      state.addNode(type, { value: node.value as string });
    }
  },
  toMarkdown: {
    match: (node) => node.type.name === 'math_inline',
    runner: (state, node) => {
      state.addNode('inlineMath', undefined, node.attrs.value as string);
    }
  }
}));

export const mathBlockSchema = $nodeSchema('math_block', () => ({
  group: 'block',
  atom: true,
  attrs: { value: { default: '' } },
  selectable: true,
  parseDOM: [
    {
      tag: 'div[data-type="math-block"]',
      getAttrs: (dom) => ({ value: (dom as HTMLElement).dataset.value ?? '' })
    }
  ],
  toDOM: (node) => [
    'div',
    { 'data-type': 'math-block', 'data-value': node.attrs.value },
    node.attrs.value
  ],
  parseMarkdown: {
    match: ({ type }) => type === 'math',
    runner: (state, node, type) => {
      state.addNode(type, { value: node.value as string });
    }
  },
  toMarkdown: {
    match: (node) => node.type.name === 'math_block',
    runner: (state, node) => {
      state.addNode('math', undefined, node.attrs.value as string);
    }
  }
}));
