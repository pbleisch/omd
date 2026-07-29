import { $view } from '@milkdown/utils';
import { imageSchema } from '@milkdown/preset-commonmark';
import type { EditorView, NodeView } from 'prosemirror-view';
import type { Node as ProseNode } from 'prosemirror-model';
import { mediaImageSchema } from './schema';
import { buildMediaRaw } from './transform';
import {
  buildResizeChrome,
  containerWidthOf,
  applyWidth,
  chromeOwnsEvent,
  inlineEdit
} from './chrome';
import { codicon } from '../../codicons';
import { resolveMediaSrc } from '../../blocks/media-base';
import { hoverEnter, hoverLeave } from '../../ui/hover-panel';
import type { EditableBlock } from '../../blocks/edit-properties';

export { snapWidth } from './chrome';

/**
 * Resize / caption / align UX for images. Two NodeViews share the media chrome (`chrome.ts`):
 *   - `omdImage` (already sized `<img width>` / captioned `<figure>`) — edits it in place;
 *   - milkdown's inline `image` (a bare `![](url)` standing alone) — the first size/caption
 *     *converts* it into an `omdImage`, so a bare image stays `![](url)` until deliberately edited.
 *
 * The chrome only shows on "sizable" images — a standalone content image — never on a thumbnail
 * inside a youtube/gallery block or a linked image.
 */

/** After a bare→omdImage caption conversion, the doc pos whose new view should auto-edit. */
let pendingCaptionFocus: number | null = null;

/**
 * Reflect an image that fails to load as a clean placeholder where the image should be — a media
 * icon plus the image's alt text (or "Image not found") in a dashed box, instead of the browser's
 * generic broken-image glyph and overflowing alt. `img.onerror` catches a missing local file and an
 * unreachable remote URL alike, so this needs no host round-trip. The placeholder is inserted lazily
 * (the img is in the DOM by the time an error fires) and hidden again on a later successful load —
 * e.g. once the media base arrives and the src re-resolves.
 */
function wireBrokenState(img: HTMLImageElement, container: HTMLElement, srcOf: () => string): void {
  let label: HTMLElement | null = null;
  const ensureBox = (): HTMLElement => {
    if (label) return label;
    const box = document.createElement('span');
    box.className = 'omd-img-broken-box';
    box.contentEditable = 'false';
    box.appendChild(codicon('file-media'));
    label = document.createElement('span');
    label.className = 'omd-img-broken-label';
    box.appendChild(label);
    img.after(box); // sibling of the (now-mounted) img, hidden until the broken class is set
    return label;
  };

  img.addEventListener('error', () => {
    ensureBox().textContent = img.alt || 'Image not found';
    container.classList.add('omd-img--broken');
    img.title = `Image not found: ${srcOf()}`;
  });
  img.addEventListener('load', () => {
    container.classList.remove('omd-img--broken');
    img.removeAttribute('title');
  });
}

class ImageView implements NodeView {
  dom: HTMLElement;
  private readonly frame: HTMLElement;
  private readonly img: HTMLImageElement;
  private readonly caption: HTMLElement;
  private readonly readout: HTMLElement;
  private editing = false;

  constructor(
    private node: ProseNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined
  ) {
    this.dom = document.createElement('span');
    this.dom.className = 'omd-img omd-img--sizable';

    this.frame = document.createElement('span');
    this.frame.className = 'omd-img-frame';
    this.img = document.createElement('img');
    this.img.draggable = false;
    wireBrokenState(this.img, this.dom, () => this.node.attrs.src as string);
    this.frame.appendChild(this.img);
    this.dom.appendChild(this.frame);

    // Only the drag handles live on the canvas now; size / align / caption moved to the
    // property panel (media-cluster unification), which hover reveals below the image.
    const chrome = buildResizeChrome({
      host: this.frame,
      target: this.img,
      containerWidth: () => containerWidthOf(this.dom, this.img),
      onCommit: (w) => this.commitWidth(w),
      stockSizes: false
    });
    this.readout = chrome.readout;

    this.caption = document.createElement('figcaption');
    this.caption.className = 'omd-img-caption';
    this.caption.addEventListener('dblclick', (e) => {
      e.preventDefault();
      this.startCaptionEdit();
    });
    this.dom.appendChild(this.caption);

    this.wireHover();
    this.render();
    if (pendingCaptionFocus != null && pendingCaptionFocus === this.getPos()) {
      pendingCaptionFocus = null;
      queueMicrotask(() => this.startCaptionEdit());
    }
  }

  private render(): void {
    this.img.src = resolveMediaSrc(this.node.attrs.src as string);
    this.img.alt = this.node.attrs.alt as string;
    applyWidth(this.img, this.readout, this.node.attrs.width as string | null);
    if (!this.editing) {
      const cap = (this.node.attrs.caption as string) ?? '';
      this.caption.textContent = cap;
      this.dom.classList.toggle('omd-img--captioned', cap.length > 0);
    }
  }

  /** This image as an editable block, for the shared hover/property panel. */
  private resolveEditable(): EditableBlock | null {
    const pos = this.getPos();
    if (pos == null) return null;
    const node = this.view.state.doc.nodeAt(pos);
    return node?.type.name === 'omdImage' ? { kind: 'image', node, pos } : null;
  }

  /** Reveal the property panel on hover; dismiss when the pointer leaves both image and panel. */
  private wireHover(): void {
    this.dom.addEventListener('mouseenter', () =>
      hoverEnter(this, this.view, () => this.resolveEditable())
    );
    this.dom.addEventListener('mouseleave', () => hoverLeave(this));
  }

  private commitWidth(width: string): void {
    const pos = this.getPos();
    if (pos == null) return;
    const node = this.view.state.doc.nodeAt(pos);
    if (!node || node.type !== this.node.type) return;
    if ((node.attrs.width as string | null) === width) return;
    const attrs: Record<string, unknown> = { ...node.attrs, width };
    attrs.raw = buildMediaRaw({
      src: attrs.src as string,
      width,
      alt: attrs.alt as string,
      caption: attrs.caption as string
    });
    this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, attrs));
    this.view.focus();
  }

  /** Inline-edit the caption; commit writes the `caption` attr + regenerated `raw` (figure form). */
  private startCaptionEdit(): void {
    this.editing = true;
    this.dom.classList.add('omd-img--captioned');
    if (!this.caption.textContent) this.caption.textContent = '';
    inlineEdit(this.caption, {
      editingClass: 'omd-img-caption--editing',
      onCommit: (text) => this.commitCaption(text),
      onCancel: () => this.render(),
      onEnd: () => {
        this.editing = false;
        this.view.focus();
      }
    });
  }

  private commitCaption(caption: string): void {
    const pos = this.getPos();
    if (pos == null) return;
    const node = this.view.state.doc.nodeAt(pos);
    if (!node || node.type !== this.node.type) return;
    if ((node.attrs.caption as string) === caption) return this.render();
    const attrs: Record<string, unknown> = { ...node.attrs, caption };
    attrs.raw = buildMediaRaw({
      src: attrs.src as string,
      width: attrs.width as string | null,
      alt: attrs.alt as string,
      caption
    });
    this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, attrs));
  }

  update(node: ProseNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  ignoreMutation(mutation: MutationRecord | { type: 'selection'; target: Node }): boolean {
    if (mutation.type === 'selection') return false;
    return true;
  }

  stopEvent(event: Event): boolean {
    if (this.editing && this.caption.contains(event.target as Node)) return true;
    return chromeOwnsEvent(this.img, event);
  }
}

// --- bare inline image: resizing/captioning converts it into an omdImage ---

class BareImageView implements NodeView {
  dom: HTMLElement;
  private readonly img: HTMLImageElement;
  private readout?: HTMLElement;
  private readonly gallery: boolean;

  constructor(
    private node: ProseNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined
  ) {
    this.dom = document.createElement('span');
    this.img = document.createElement('img');
    this.img.draggable = false;
    wireBrokenState(this.img, this.dom, () => this.node.attrs.src as string);
    this.gallery = this.inGallery();

    if (this.gallery) {
      // A gallery thumbnail: fill the grid cell, no resize chrome, a hover remove button.
      this.dom.className = 'omd-gallery-item';
      this.dom.appendChild(this.img);
      const remove = document.createElement('button');
      remove.className = 'omd-gallery-remove';
      remove.type = 'button';
      remove.title = 'Remove image';
      remove.appendChild(codicon('close'));
      remove.addEventListener('mousedown', (e) => e.preventDefault());
      remove.addEventListener('click', (e) => {
        e.preventDefault();
        this.removeFromGallery();
      });
      this.dom.appendChild(remove);
    } else {
      // Drag handles only (like the sized image) — dragging converts to an omdImage. Size/align/
      // caption and the source path live in the shared floating panel, revealed on hover.
      this.dom.className = 'omd-img';
      this.dom.appendChild(this.img);
      this.readout = buildResizeChrome({
        host: this.dom,
        target: this.img,
        containerWidth: () => containerWidthOf(this.dom, this.img),
        onCommit: (w) => this.convert(w),
        stockSizes: false
      }).readout;
      this.wireHover();
    }
    this.render();
  }

  /** This bare image as an editable block, for the shared hover/property panel (Source field). */
  private resolveEditable(): EditableBlock | null {
    const pos = this.getPos();
    if (pos == null) return null;
    const node = this.view.state.doc.nodeAt(pos);
    return node?.type.name === 'image' ? { kind: 'image', node, pos } : null;
  }

  /** Reveal the property panel on hover; dismiss when the pointer leaves both image and panel. */
  private wireHover(): void {
    this.dom.addEventListener('mouseenter', () =>
      hoverEnter(this, this.view, () => this.resolveEditable())
    );
    this.dom.addEventListener('mouseleave', () => hoverLeave(this));
  }

  private render(): void {
    this.img.src = resolveMediaSrc(this.node.attrs.src as string);
    this.img.alt = (this.node.attrs.alt as string) ?? '';
    if (this.gallery) return;
    if (this.readout) this.readout.textContent = 'auto';
    this.dom.classList.toggle('omd-img--sizable', this.sizable());
  }

  /** True when this image lives inside a `gallery` shortcode container. */
  private inGallery(): boolean {
    const pos = this.getPos();
    if (pos == null) return false;
    const $pos = this.view.state.doc.resolve(pos);
    for (let d = $pos.depth; d > 0; d--) {
      const n = $pos.node(d);
      if (n.type.name === 'shortcode_container' && n.attrs.name === 'gallery') return true;
    }
    return false;
  }

  /** Remove just this image (a paragraph may hold several); drop the paragraph if it was the last. */
  private removeFromGallery(): void {
    const pos = this.getPos();
    if (pos == null) return;
    const state = this.view.state;
    const node = state.doc.nodeAt(pos);
    if (!node) return;
    const $pos = state.doc.resolve(pos);
    const tr =
      $pos.parent.childCount === 1
        ? state.tr.delete($pos.before(), $pos.after()) // sole image → remove its paragraph
        : state.tr.delete(pos, pos + node.nodeSize); // one of several → remove just this image
    this.view.dispatch(tr.scrollIntoView());
    this.view.focus();
  }

  /** A standalone content image (sole child of a paragraph, not linked, not a block thumbnail). */
  private sizable(): boolean {
    const pos = this.getPos();
    if (pos == null) return false;
    const $pos = this.view.state.doc.resolve(pos);
    for (let d = $pos.depth; d > 0; d--) {
      const n = $pos.node(d).type.name;
      if (n === 'shortcode_container' || n === 'shortcode_leaf') return false;
    }
    const parent = $pos.parent;
    if (parent.type.name !== 'paragraph' || parent.childCount !== 1) return false;
    return !this.node.marks.some((m) => m.type.name === 'link');
  }

  /** Turn the standalone `![](url)` into an omdImage block — sized, or (width null) to caption it. */
  private convert(width: string | null): void {
    const pos = this.getPos();
    if (pos == null || !this.sizable()) return;
    const $pos = this.view.state.doc.resolve(pos);
    const from = $pos.before();
    const to = $pos.after();
    const src = this.node.attrs.src as string;
    const alt = (this.node.attrs.alt as string) ?? '';
    const omd = this.view.state.schema.nodes.omdImage.create({
      src,
      alt,
      width,
      caption: '',
      raw: buildMediaRaw({ src, width, alt, caption: '' })
    });
    this.view.dispatch(this.view.state.tr.replaceRangeWith(from, to, omd));
    if (width == null) pendingCaptionFocus = from;
    this.view.focus();
  }

  update(node: ProseNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  ignoreMutation(): boolean {
    return true;
  }

  stopEvent(event: Event): boolean {
    const t = event.target as HTMLElement;
    if (this.gallery) return t !== this.img && t.closest('.omd-gallery-remove') != null;
    return chromeOwnsEvent(this.img, event);
  }
}

export const mediaImageView = $view(
  mediaImageSchema.node,
  () => (node, view, getPos) =>
    new ImageView(node as ProseNode, view as EditorView, getPos as () => number | undefined)
);

export const bareImageView = $view(
  imageSchema.node,
  () => (node, view, getPos) =>
    new BareImageView(node as ProseNode, view as EditorView, getPos as () => number | undefined)
);
