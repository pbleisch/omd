import type { MdNode } from '../shortcode/transform';

/**
 * Parse-side half of the media coexistence form (media cluster design): fold a standalone
 * `<img …>` html node into an `omdImage` mdast node the schema can render and resize. GitHub
 * sizes/aligns media with raw `<img width>` HTML, so a *sized* image is written as `<img>` and a
 * bare one stays `![](url)`. The exact `<img>` bytes are preserved in `raw` so an untouched image
 * round-trips verbatim (only a UI edit regenerates them).
 *
 * Only a *standalone* image (its own block, or a paragraph wrapping a single inline `<img>`) is
 * lifted — an `<img>` sitting inside a sentence stays opaque html (still round-trips as-is).
 */

const IMG_ONLY = /^<img\b[^>]*>$/i;

/** The `<img …>` html a node carries as a standalone image, or null. */
export function standaloneImg(node: MdNode): string | null {
  if (node.type === 'html' && typeof node.value === 'string' && IMG_ONLY.test(node.value.trim()))
    return node.value.trim();
  if (node.type === 'paragraph' && node.children?.length === 1) {
    const only = node.children[0];
    if (only.type === 'html' && typeof only.value === 'string' && IMG_ONLY.test(only.value.trim()))
      return only.value.trim();
  }
  return null;
}

/** Read one HTML attribute (double- or single-quoted) off a tag string. */
export function imgAttr(html: string, name: string): string | null {
  const dq = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(html);
  if (dq) return dq[1];
  const sq = new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, 'i').exec(html);
  return sq ? sq[1] : null;
}

const attrEsc = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const textEsc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const textUnesc = (s: string): string =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

/**
 * The canonical `<img …>` bytes for a (re)sized image — written when a UI edit changes width, so
 * the node's `raw` stays in sync. Attribute order is fixed (src, width, alt) and GitHub-safe; an
 * empty alt is omitted. `"` in values is entity-escaped so the tag can't break.
 */
export function buildImgRaw(attrs: { src: string; width?: string | null; alt?: string }): string {
  let out = `<img src="${attrEsc(attrs.src)}"`;
  if (attrs.width) out += ` width="${attrEsc(attrs.width)}"`;
  if (attrs.alt) out += ` alt="${attrEsc(attrs.alt)}"`;
  return out + '>';
}

/**
 * The bytes an `omdImage` serializes to, by which attrs are set (media cluster design):
 *   - a caption → a `<figure>` wrapping the `<img>` and a `<figcaption>` (GitHub renders it);
 *   - otherwise a plain `<img width>`.
 * Regenerated on any caption/width edit so `raw` always matches the model.
 */
export function buildMediaRaw(attrs: {
  src: string;
  width?: string | null;
  alt?: string;
  caption?: string;
}): string {
  if (attrs.caption)
    return `<figure>\n  ${buildImgRaw(attrs)}\n  <figcaption>${textEsc(attrs.caption)}</figcaption>\n</figure>`;
  if (attrs.width) return buildImgRaw(attrs);
  // Neither width nor caption → back to plain markdown, so clearing a caption/size returns the
  // image to a bare `![](url)` rather than leaving a size-less `<img>`.
  return `![${attrs.alt ?? ''}](${attrs.src})`;
}

/** The `<figure>…</figure>` html a node carries as a standalone captioned image, or null. */
const FIGURE_ONLY = /^<figure\b[\s\S]*<\/figure>$/i;
export function standaloneFigure(node: MdNode): string | null {
  const raw =
    node.type === 'html' && typeof node.value === 'string'
      ? node.value.trim()
      : node.type === 'paragraph' && node.children?.length === 1 && node.children[0].type === 'html'
        ? String(node.children[0].value ?? '').trim()
        : null;
  if (raw && FIGURE_ONLY.test(raw) && /<img\b/i.test(raw)) return raw;
  return null;
}

/** Pull the caption text out of a `<figure>`'s `<figcaption>`, unescaped. */
export function figureCaption(html: string): string {
  const m = /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i.exec(html);
  return m ? textUnesc(m[1].trim()) : '';
}

function toOmdImage(html: string): MdNode {
  return {
    type: 'omdImage',
    src: imgAttr(html, 'src') ?? '',
    alt: imgAttr(html, 'alt') ?? '',
    width: imgAttr(html, 'width'), // string | null
    caption: '',
    raw: html
  };
}

function figureToOmdImage(figure: string): MdNode {
  const img = /<img\b[^>]*>/i.exec(figure)?.[0] ?? '';
  return {
    type: 'omdImage',
    src: imgAttr(img, 'src') ?? '',
    alt: imgAttr(img, 'alt') ?? '',
    width: imgAttr(img, 'width'),
    caption: figureCaption(figure),
    raw: figure
  };
}

/**
 * Block containers we descend into so a sized image nested in them converts too. We must NOT
 * recurse into phrasing containers (paragraph/heading): an inline `<img>` mid-sentence is opaque
 * html, and turning it into a block `omdImage` inside inline content would break the schema.
 */
const BLOCK_CONTAINERS = new Set(['root', 'blockquote', 'listItem', 'list', 'omdAligned', 'omdContainer']);

/** Rewrite one level of siblings, then recurse into block containers only. */
export function pairMedia(children: MdNode[]): MdNode[] {
  return children.map((node) => {
    const figure = standaloneFigure(node);
    if (figure) return figureToOmdImage(figure);
    const html = standaloneImg(node);
    // Only lift a *sized* image — an `<img>` with no width stays opaque html and round-trips as
    // is. This keeps the invariant "an omdImage always carries a width or a caption", so
    // serialization is unambiguous (it never re-emits a bare `![]()`).
    if (html && imgAttr(html, 'width')) return toOmdImage(html);
    if (Array.isArray(node.children) && BLOCK_CONTAINERS.has(node.type)) node.children = pairMedia(node.children);
    return node;
  });
}

export function transformMedia(tree: MdNode): void {
  if (Array.isArray(tree.children)) tree.children = pairMedia(tree.children);
}
