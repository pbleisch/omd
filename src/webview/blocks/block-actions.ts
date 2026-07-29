import type { EditorView } from 'prosemirror-view';
import { codicon } from '../codicons';
import { post, log } from '../vscode';

/**
 * The common actions every smart block gets in its header (docs/design/STYLE.md): copy, save, delete —
 * in that order. Copy and save export the block's *preview* in whatever format fits it (a chart
 * is a PNG; a text block is its text); delete removes the whole block. The buttons are chrome,
 * so the group opts out of contentEditable and each button preventDefaults its mousedown to keep
 * the editor selection intact.
 */

export interface BlockActionHandlers {
  view: EditorView;
  getPos: () => number | undefined;
  /** Copy the preview to the clipboard. */
  onCopy: () => void | Promise<void>;
  /** Export the preview to a file (via the host's save dialog). */
  onSave: () => void | Promise<void>;
}

function actionButton(icon: string, title: string, run: () => void | Promise<void>): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'omd-block-action';
  btn.title = title;
  btn.setAttribute('aria-label', title);
  btn.appendChild(codicon(icon));
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    void run();
  });
  return btn;
}

/** Delete the whole block at `getPos()`. */
export function deleteBlockAt(view: EditorView, getPos: () => number | undefined): void {
  const pos = getPos();
  if (pos == null) return;
  const node = view.state.doc.nodeAt(pos);
  if (!node) return;
  view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize).scrollIntoView());
  view.focus();
}

export function blockActions(handlers: BlockActionHandlers): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'omd-block-actions';
  wrap.contentEditable = 'false';
  wrap.append(
    actionButton('copy', 'Copy', handlers.onCopy),
    actionButton('save', 'Save as…', handlers.onSave),
    actionButton('trash', 'Delete block', () => deleteBlockAt(handlers.view, handlers.getPos))
  );
  return wrap;
}

// --- preview export helpers (the "appropriate format" per block) ---

/** Copy a canvas (e.g. a rendered chart) to the clipboard as a PNG image. */
export async function copyCanvasPng(canvas: HTMLCanvasElement): Promise<void> {
  try {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (blob && 'clipboard' in navigator && 'write' in navigator.clipboard) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    }
  } catch (err) {
    log('warn', `copy PNG failed: ${String(err)}`);
  }
}

/** Copy plain text to the clipboard. */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard?.writeText(text);
  } catch (err) {
    log('warn', `copy text failed: ${String(err)}`);
  }
}

/** Export a canvas as a PNG file (host save dialog). */
export function saveCanvasPng(canvas: HTMLCanvasElement, name: string): void {
  const data = canvas.toDataURL('image/png').split(',')[1] ?? '';
  post({ type: 'saveAs', name: ensureExt(name, 'png'), data, encoding: 'base64' });
}

/** Export plain text as a file (host save dialog). */
export function saveTextFile(text: string, name: string): void {
  post({ type: 'saveAs', name, data: text, encoding: 'utf8' });
}

/**
 * Copy an SVG preview (e.g. a mermaid diagram) to the clipboard. Prefers a rasterized PNG so it
 * pastes as an image, but falls back to the SVG source text when rasterizing isn't possible —
 * a `<foreignObject>` (mermaid's html labels) taints the canvas, and clipboard image support is
 * uneven. Either way the user gets something pasteable.
 */
export async function copySvgPreview(svg: SVGSVGElement): Promise<void> {
  const xml = new XMLSerializer().serializeToString(svg);
  try {
    const blob = await svgToPngBlob(xml, svg);
    if (blob && 'clipboard' in navigator && 'write' in navigator.clipboard) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return;
    }
  } catch (err) {
    log('warn', `copy SVG as PNG failed, falling back to SVG text: ${String(err)}`);
  }
  await copyText(xml);
}

/** Export an SVG preview as a `.svg` file — lossless vector, the fitting format for a diagram. */
export function saveSvgPreview(svg: SVGSVGElement, name: string): void {
  saveTextFile(new XMLSerializer().serializeToString(svg), ensureExt(name, 'svg'));
}

/**
 * Save an image (by URL, e.g. a YouTube thumbnail) as a PNG file. Loads it cross-origin so the
 * canvas isn't tainted; returns false if that fails (the host serves no CORS headers), so the
 * caller can fall back — a remote thumbnail can't always be rasterized, and that's fine.
 */
export async function saveImageAsPng(imgUrl: string, name: string): Promise<boolean> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('image load failed (no CORS?)'));
      img.src = imgUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 480;
    canvas.height = img.naturalHeight || 360;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0);
    const data = canvas.toDataURL('image/png').split(',')[1] ?? ''; // throws if tainted
    post({ type: 'saveAs', name: ensureExt(name, 'png'), data, encoding: 'base64' });
    return true;
  } catch (err) {
    log('warn', `save image as PNG failed: ${String(err)}`);
    return false;
  }
}

/** Rasterize an SVG to a PNG blob at 2× for crisp output; may throw/return null if tainted. */
async function svgToPngBlob(xml: string, svg: SVGSVGElement): Promise<Blob | null> {
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('svg image load failed'));
      img.src = url;
    });
    const vb = svg.viewBox?.baseVal;
    const w = Math.max(1, Math.round(vb?.width || img.naturalWidth || 800));
    const h = Math.max(1, Math.round(vb?.height || img.naturalHeight || 600));
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

function ensureExt(name: string, ext: string): string {
  return name.toLowerCase().endsWith(`.${ext}`) ? name : `${name}.${ext}`;
}
