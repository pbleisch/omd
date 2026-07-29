import { $nodeSchema, $remark } from '@milkdown/utils';
import type { MdNode } from '../shortcode/transform';
import { transformMedia } from './transform';

/**
 * The `omdImage` node — a sized / aligned / captioned image in its GFM-visible coexistence form
 * (media cluster design). A bare `![](url)` stays milkdown's inline image; only once an image gets
 * a size (later align/caption) does it become `<img …>` HTML, which GitHub renders too. The exact
 * `<img>` bytes live in `raw` and re-emit verbatim, so the construct round-trips byte-for-byte
 * until a UI edit deliberately regenerates them.
 *
 * Step 1 (this commit) is the round-trip spine: parse `<img>` → node → identical bytes, rendered
 * as an image. Resize handles, caption editing, and the align/property panel build on top.
 */

export const remarkMedia = $remark('omd-media', () => () => (tree: MdNode) => {
  transformMedia(tree);
});

export const mediaImageSchema = $nodeSchema('omdImage', () => ({
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  attrs: {
    src: { default: '' },
    alt: { default: '' },
    width: { default: null }, // string (px or %) | null
    align: { default: null }, // 'left' | 'center' | 'right' | null (folded in a later step)
    caption: { default: '' },
    raw: { default: '' } // the exact <img …> bytes, for a verbatim round-trip
  },
  parseDOM: [
    {
      tag: 'img[data-omd-image]',
      getAttrs: (dom) => {
        const el = dom as HTMLElement;
        return {
          src: el.getAttribute('src') ?? '',
          alt: el.getAttribute('alt') ?? '',
          width: el.getAttribute('width'),
          align: el.dataset.align ?? null,
          caption: el.getAttribute('data-caption') ?? '',
          raw: el.getAttribute('data-raw') ?? ''
        };
      }
    }
  ],
  toDOM: (node) => {
    const { src, alt, width } = node.attrs;
    const attrs: Record<string, string> = { src, alt, 'data-omd-image': '' };
    if (width) attrs.width = width;
    if (node.attrs.align) attrs['data-align'] = node.attrs.align;
    if (node.attrs.caption) attrs['data-caption'] = node.attrs.caption;
    if (node.attrs.raw) attrs['data-raw'] = node.attrs.raw;
    return ['img', attrs];
  },
  parseMarkdown: {
    match: ({ type }) => type === 'omdImage',
    runner: (state, node, type) => {
      state.addNode(type, {
        src: node.src as string,
        alt: node.alt as string,
        width: (node.width as string | null) ?? null,
        caption: (node.caption as string) ?? '',
        raw: node.raw as string
      });
    }
  },
  toMarkdown: {
    match: (node) => node.type.name === 'omdImage',
    runner: (state, node) => {
      // Serialize verbatim from the preserved bytes (byte-stable). UI edits regenerate `raw`.
      state.addNode('html', undefined, node.attrs.raw as string);
    }
  }
}));
