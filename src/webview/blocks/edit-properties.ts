import { NodeSelection, type EditorState } from 'prosemirror-state';
import type { Node as ProseNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { parseParams, stringifyParams } from '../../shared/shortcode';
import type { BlockDefinition } from '../../shared/blocks';
import { getBlock } from './registry';
import { updateBlockParams } from './params';
import { openParamPanel, type ParamFieldSpec } from '../ui/param-panel';
import type { FloatingAnchor, FloatingHandle } from '../ui/floating';
import { alignOfPos, setAlignAbsolute, STOCK_PX, ALIGN_ICON, type Align } from '../plugins/media/chrome';
import { buildMediaRaw } from '../plugins/media/transform';

/**
 * The bridge from "a smart block under the cursor" to "its property panel" (Phase 2). Every
 * trigger — the context menu's "Edit properties…", the block hover, a selected image — resolves
 * a block and commits through the same panel, so there is one editing path. Two kinds of block
 * are editable: a smart `shortcode` (params) and an `omdImage` (size / align / caption), and both
 * lay their fields out the same way (media properties, then params) per the unification design.
 */

export type EditableBlock =
  | { kind: 'shortcode'; node: ProseNode; pos: number; def: BlockDefinition }
  | { kind: 'image'; node: ProseNode; pos: number };

/**
 * The block the selection sits in that has editable properties, or null. Handles a directly-
 * selected image / leaf / container (NodeSelection) and a cursor nested inside a container.
 * A shortcode with no declared params returns null — there is nothing to edit.
 */
export function findEditableBlock(state: EditorState): EditableBlock | null {
  const sel = state.selection;

  if (sel instanceof NodeSelection) {
    const node = sel.node;
    if (node.type.name === 'omdImage' || node.type.name === 'image')
      return { kind: 'image', node, pos: sel.from };
    if (node.type.name === 'shortcode_leaf' || node.type.name === 'shortcode_container') {
      const def = getBlock(node.attrs.name);
      if (def?.params?.length) return { kind: 'shortcode', node, pos: sel.from, def };
    }
  }

  const $from = sel.$from;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === 'shortcode_container') {
      const def = getBlock(node.attrs.name);
      return def?.params?.length ? { kind: 'shortcode', node, pos: $from.before(d), def } : null;
    }
  }
  return null;
}

/**
 * A "below the block" anchor from the block's rendered DOM, falling back to cursor coords.
 * `width` is the block's rendered width (0 when unknown), used to size the panel to match.
 */
function blockAnchor(view: EditorView, pos: number): FloatingAnchor & { width: number } {
  const dom = view.nodeDOM(pos);
  if (dom instanceof HTMLElement) {
    const r = dom.getBoundingClientRect();
    return { left: r.left, top: r.top, bottom: r.bottom, width: r.width };
  }
  const c = view.coordsAtPos(pos + 1);
  return { left: c.left, top: c.top, bottom: c.bottom, width: 0 };
}

/**
 * The smart callout keeps its title as the bold first line of the body (not a param, so GitHub
 * renders it), but we still surface it in the panel. This reads that first line.
 */
function calloutTitle(node: ProseNode): string {
  const bq = node.firstChild; // the blockquote body
  return bq?.firstChild?.textContent ?? '';
}

/** Write the smart callout's title back into the bold first line of its body. */
function setCalloutTitle(view: EditorView, pos: number, title: string): void {
  const container = view.state.doc.nodeAt(pos);
  const bq = container?.firstChild;
  const firstPara = bq?.firstChild;
  if (!container || !bq || bq.type.name !== 'blockquote' || !firstPara) return;
  if (firstPara.textContent === title) return;
  const from = pos + 3; // container-open + blockquote-open + paragraph-open
  const to = from + firstPara.content.size;
  const strong = view.state.schema.marks.strong.create();
  const tr = title
    ? view.state.tr.replaceWith(from, to, view.state.schema.text(title, [strong]))
    : view.state.tr.delete(from, to);
  view.dispatch(tr);
}

/** Open the property panel for a resolved block, committing edits back to its node. */
export function openBlockProperties(view: EditorView, block: EditableBlock): FloatingHandle {
  if (block.kind === 'image') return openImageProperties(view, block.pos);
  if (block.def.name === 'youtube') return openYouTubeProperties(view, block.pos);
  return openShortcodeProperties(view, block);
}

const WIDTH_SEGMENTS = [
  { value: String(STOCK_PX[0]), label: 'S', title: 'Small' },
  { value: String(STOCK_PX[1]), label: 'M', title: 'Medium' },
  { value: String(STOCK_PX[2]), label: 'L', title: 'Large' },
  { value: '100%', label: 'Full', title: 'Full width' }
];
const ALIGN_SEGMENTS = (['left', 'center', 'right'] as Align[]).map((a) => ({
  value: a,
  icon: ALIGN_ICON[a],
  title: `Align ${a}`
}));

function openShortcodeProperties(
  view: EditorView,
  block: Extract<EditableBlock, { kind: 'shortcode' }>
): FloatingHandle {
  const { def, node, pos } = block;
  const current = parseParams(node.attrs.params as string);
  const isCallout = def.name === 'callout';
  const fields: ParamFieldSpec[] = [
    // Title first (a content-backed field for the callout), then the block's own params.
    ...(isCallout
      ? [{ name: 'title', label: 'Title', type: 'string' as const, value: calloutTitle(node) }]
      : []),
    ...(def.params ?? []).map((p) => ({
      name: p.name,
      label: p.label ?? p.name,
      type: p.type,
      value: current[p.name] ?? p.default,
      options: p.options
    }))
  ];

  const anchor = blockAnchor(view, pos);
  return openParamPanel({
    title: def.title,
    icon: def.icon,
    fields,
    anchor,
    width: anchor.width || undefined,
    autoApply: true,
    reposition: () => (view.state.doc.nodeAt(pos) ? blockAnchor(view, pos) : null),
    onApply: (values) => {
      if (isCallout) {
        // `title` is content (the bold first line), not a param — commit it separately.
        const { title, ...params } = values as Record<string, unknown>;
        setCalloutTitle(view, pos, String(title ?? '').trim());
        updateBlockParams(view, pos, { ...current, ...params });
      } else {
        // Merge over the stored params so keys the panel doesn't manage are preserved.
        updateBlockParams(view, pos, { ...current, ...values });
      }
    }
  });
}

/** The located image behind the panel: the node, its position, and whether it's still bare. */
interface LocatedImage {
  pos: number;
  node: ProseNode;
  bare: boolean;
}

/**
 * The image property panel. Every *standalone* image edits the same way — Source + Width + Align +
 * Caption — regardless of whether it's currently a bare `![](src)` or a promoted `omdImage`, so a
 * user never has to know or care which on-disk form it's in (media-cluster unification). Coexistence
 * is preserved: an untouched image stays a bare `![](src)`; the first size/align/caption promotes it
 * to the matching GitHub-visible form (`<img width>` / `<div align>` / `<figure>`), and clearing
 * them again lets it fall back to bare. An *inline* image (one sharing a paragraph with text) can't
 * be a block, so it offers Source only.
 *
 * The panel anchors to a stable position — the paragraph of a bare image, which the promoted
 * `omdImage` replaces at that same spot, or the `omdImage`/`aligned` node itself — so promotion and
 * align wrap/unwrap mid-edit never strand it; the image is re-located from that anchor on every
 * commit.
 */
function openImageProperties(view: EditorView, openPos: number): FloatingHandle {
  const $open = view.state.doc.resolve(openPos);
  const openNode = view.state.doc.nodeAt(openPos);

  // The stable anchor + whether this image can carry block properties (size/align/caption).
  let anchorPos: number;
  let standalone: boolean;
  if (openNode?.type.name === 'image') {
    anchorPos = $open.before($open.depth); // the paragraph holding the bare image
    standalone =
      $open.parent.type.name === 'paragraph' &&
      $open.parent.childCount === 1 &&
      !openNode.marks.some((m) => m.type.name === 'link');
  } else {
    anchorPos = $open.parent.type.name === 'aligned' ? openPos - 1 : openPos;
    standalone = true;
  }

  /** Re-find the image from the stable anchor (paragraph → bare, omdImage / aligned → promoted). */
  const locate = (): LocatedImage | null => {
    const at = view.state.doc.nodeAt(anchorPos);
    if (!at) return null;
    if (at.type.name === 'omdImage') return { pos: anchorPos, node: at, bare: false };
    if (at.type.name === 'aligned' && at.firstChild?.type.name === 'omdImage')
      return { pos: anchorPos + 1, node: at.firstChild, bare: false };
    if (at.type.name === 'paragraph' && at.firstChild?.type.name === 'image')
      return { pos: anchorPos + 1, node: at.firstChild, bare: true };
    return null;
  };

  const start = locate();
  const node = start?.node;
  const startAlign = start && !start.bare ? alignOfPos(view, start.pos) : null;

  const fields: ParamFieldSpec[] = [
    { name: 'source', label: 'Source', type: 'string', value: (node?.attrs.src as string) ?? '' }
  ];
  if (standalone) {
    fields.push(
      { name: 'width', label: 'Width', type: 'width', segments: WIDTH_SEGMENTS, value: (node?.attrs.width as string) ?? '' },
      { name: 'align', label: 'Align', type: 'segmented', segments: ALIGN_SEGMENTS, value: startAlign ?? '' },
      { name: 'caption', label: 'Caption', type: 'string', value: (node?.attrs.caption as string) ?? '' }
    );
  }

  // Deliberately don't match the image's width — an image can be any size (a 240px thumbnail, an
  // 860px full-width), so the panel keeps its natural size (CSS-clamped) for a consistent form.
  return openParamPanel({
    title: 'Image',
    icon: 'file-media',
    fields,
    anchor: blockAnchor(view, anchorPos),
    autoApply: true,
    reposition: () => (view.state.doc.nodeAt(anchorPos) ? blockAnchor(view, anchorPos) : null),
    onApply: (values) => {
      const loc = locate();
      if (!loc) return;
      const src = String(values.source ?? '').trim();
      const width = (values.width as string) || null;
      const caption = String(values.caption ?? '');
      const desiredAlign = ((values.align as string) || null) as Align | null;

      if (loc.bare) {
        // A bare `![](src)` stays bare until a rich property is set; then it promotes to the
        // matching coexistence form. Editing only the source keeps it a plain markdown image.
        const wantsRich = width != null || caption !== '' || desiredAlign != null;
        const alt = (loc.node.attrs.alt as string) ?? '';
        const finalSrc = src || (loc.node.attrs.src as string);
        if (!wantsRich) {
          if (finalSrc !== loc.node.attrs.src)
            view.dispatch(view.state.tr.setNodeMarkup(loc.pos, undefined, { ...loc.node.attrs, src: finalSrc }));
          return;
        }
        const para = view.state.doc.nodeAt(anchorPos);
        if (!para) return;
        const omd = view.state.schema.nodes.omdImage.create({
          src: finalSrc,
          alt,
          width,
          caption,
          raw: buildMediaRaw({ src: finalSrc, width, alt, caption })
        });
        view.dispatch(view.state.tr.replaceWith(anchorPos, anchorPos + para.nodeSize, omd));
        if (desiredAlign) {
          const promoted = locate();
          if (promoted) setAlignAbsolute(view, promoted.pos, desiredAlign);
        }
        return;
      }

      // Already an omdImage: source + width + caption are attrs (regenerate the verbatim bytes);
      // align is the wrapper. Never clear the src to empty (that would strand the block).
      const cur = loc.node;
      const nextSrc = src || (cur.attrs.src as string);
      if (cur.attrs.src !== nextSrc || cur.attrs.width !== width || cur.attrs.caption !== caption) {
        view.dispatch(
          view.state.tr.setNodeMarkup(loc.pos, undefined, {
            ...cur.attrs,
            src: nextSrc,
            width,
            caption,
            raw: buildMediaRaw({ src: nextSrc, width, alt: cur.attrs.alt as string, caption })
          })
        );
      }
      const after = locate();
      if (after && alignOfPos(view, after.pos) !== desiredAlign)
        setAlignAbsolute(view, after.pos, desiredAlign);
    }
  });
}

/**
 * The YouTube property panel — the same unified layout as the image (title first, then media
 * properties, then other params), so a video edits identically. Width/caption/url/title are
 * shortcode params; align is the `<div align>` wrapper. Like the image, the container may be
 * wrapped in `aligned`, so we anchor to the stable outer position and re-derive the container's
 * own position on every commit.
 */
function openYouTubeProperties(view: EditorView, openPos: number): FloatingHandle {
  const $open = view.state.doc.resolve(openPos);
  const outerPos = $open.parent.type.name === 'aligned' ? openPos - 1 : openPos;

  const containerPos = (): number | null => {
    const at = view.state.doc.nodeAt(outerPos);
    if (at?.type.name === 'shortcode_container') return outerPos;
    if (at?.type.name === 'aligned' && at.firstChild?.type.name === 'shortcode_container')
      return outerPos + 1;
    return null;
  };

  const cp0 = containerPos();
  const node = cp0 == null ? null : view.state.doc.nodeAt(cp0);
  const params = parseParams((node?.attrs.params as string) ?? '');
  const startAlign = cp0 == null ? null : alignOfPos(view, cp0);

  const fields: ParamFieldSpec[] = [
    { name: 'title', label: 'Title', type: 'string', value: params.title ?? '' },
    { name: 'url', label: 'URL', type: 'string', value: params.url ?? '' },
    { name: 'width', label: 'Width', type: 'width', segments: WIDTH_SEGMENTS, value: params.width ?? '' },
    { name: 'align', label: 'Align', type: 'segmented', segments: ALIGN_SEGMENTS, value: startAlign ?? '' },
    { name: 'caption', label: 'Caption', type: 'string', value: params.caption ?? '' }
  ];

  const anchor = blockAnchor(view, outerPos);
  return openParamPanel({
    title: 'YouTube',
    icon: 'youtube',
    fields,
    anchor,
    width: anchor.width || undefined,
    autoApply: true,
    reposition: () => (view.state.doc.nodeAt(outerPos) ? blockAnchor(view, outerPos) : null),
    onApply: (values) => {
      const cp = containerPos();
      if (cp == null) return;
      const cur = view.state.doc.nodeAt(cp);
      if (!cur || cur.attrs.name !== 'youtube') return;

      // Merge text/width params, pruning empties so cleared fields drop from the params bytes.
      const next: Record<string, unknown> = { ...parseParams(cur.attrs.params as string) };
      for (const key of ['title', 'url', 'width', 'caption']) {
        const v = String(values[key] ?? '').trim();
        if (v) next[key] = v;
        else delete next[key];
      }
      if (stringifyParams(next) !== cur.attrs.params) updateBlockParams(view, cp, next);

      // Align is the <div align> wrapper — absolute set (idempotent under auto-apply).
      const desired = ((values.align as string) || null) as Align | null;
      const cp2 = containerPos();
      if (cp2 != null && alignOfPos(view, cp2) !== desired) setAlignAbsolute(view, cp2, desired);
    }
  });
}
