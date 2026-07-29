import { matchOpen, matchClose, parseParams } from './shortcode';

/**
 * Export-only remark transform that renders OMD's smart-block *content* in its OMD-styled form —
 * the "preserve the OMD view" export (option B). It runs on the export pipeline (not the GitHub
 * preview), turning the shortcode-comment machinery into styled HTML **without any editing chrome**
 * (no header bars, action buttons, gears, drag/resize handles, or tab-switch controls — content
 * only). Coexistence forms that already render (chart SVG+table, columns `<table>`, `<details>`,
 * media images, aligned `<div>`) are left untouched; this only upgrades the constructs that would
 * otherwise degrade to plain markdown: smart callouts, link cards, date chips, and tabs.
 *
 * Pure: no `vscode`, no DOM. Operates on the mdast, where a `<!-- omd:… -->` line is a block-level
 * `html` node with its body as sibling nodes (verified against the export parser).
 */

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const html = (value: string): MdNode => ({ type: 'html', value });

/** Bare date token; `g` for scanning, callers reset lastIndex. */
const DATE_TOKEN = /📅 (\d{4}-\d{2}-\d{2})/g;

/**
 * Small inline-SVG icon set for smart-callout `icon` params (codicon names). Monochrome, tinted by
 * the callout accent via `currentColor`. Unknown names fall back to the info glyph.
 */
const ICONS: Record<string, string> = {
  info: '<circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="7.25" y="7" width="1.5" height="5" rx=".75" fill="currentColor"/><circle cx="8" cy="4.6" r="1" fill="currentColor"/>',
  'light-bulb': '<path d="M8 1.5a4.5 4.5 0 0 0-2.7 8.1c.4.3.7.8.7 1.3v.6h4v-.6c0-.5.3-1 .7-1.3A4.5 4.5 0 0 0 8 1.5Z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M6.2 13.5h3.6M6.8 15h2.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
  megaphone: '<path d="M3 6.5v3l2 .5v2.5h1.5V10l6 2V4l-6 2H3z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>',
  warning: '<path d="M8 2 15 14H1L8 2z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><rect x="7.25" y="6" width="1.5" height="4" rx=".75" fill="currentColor"/><circle cx="8" cy="12" r="1" fill="currentColor"/>',
  error: '<circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  check: '<circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M4.8 8.2 7 10.4l4-4.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  comment: '<path d="M2 3.5h12v8H8l-3 2.5V11.5H2z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>'
};

function iconSvg(name: string): string {
  const body = ICONS[name] ?? ICONS.info;
  return `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${body}</svg>`;
}

/** Opening/closing HTML for the styled smart-callout box (accent + icon; body renders inside). */
function calloutOpen(params: Record<string, unknown>): string {
  const color = typeof params.color === 'string' ? params.color : '#4daafc';
  const icon = typeof params.icon === 'string' ? params.icon : 'info';
  return `<div class="omd-callout" style="--omd-accent:${esc(color)}"><span class="omd-callout-icon">${iconSvg(icon)}</span>`;
}

/** The link-card content (thumbnail / title / description / site), no action bar. */
function linkcardHtml(params: Record<string, unknown>): string {
  const url = String(params.url ?? '');
  const title = String(params.title ?? '') || hostnameOf(url) || url;
  const desc = String(params.description ?? '');
  const site = String(params.site ?? '') || hostnameOf(url);
  const image = String(params.image ?? '');
  const img = image ? `<img class="omd-linkcard-image" src="${esc(image)}" alt="">` : '';
  const descEl = desc ? `<div class="omd-linkcard-desc">${esc(desc)}</div>` : '';
  const siteEl = site ? `<div class="omd-linkcard-site">${esc(site)}</div>` : '';
  return (
    `<a class="omd-linkcard" href="${esc(url)}">${img}` +
    `<div class="omd-linkcard-text"><div class="omd-linkcard-title">${esc(title)}</div>${descEl}${siteEl}</div></a>`
  );
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Split date tokens out of a text node into styled chip `html` nodes. */
function splitDateTokens(text: string): MdNode[] | null {
  DATE_TOKEN.lastIndex = 0;
  if (!DATE_TOKEN.test(text)) return null;
  DATE_TOKEN.lastIndex = 0;
  const out: MdNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = DATE_TOKEN.exec(text))) {
    if (m.index > last) out.push({ type: 'text', value: text.slice(last, m.index) });
    out.push(html(`<span class="omd-date-chip">📅 ${m[1]}</span>`));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
  return out;
}

/**
 * Rewrite one children array: turn OMD shortcode comments into styled wrappers (callout, tabs, tab),
 * link cards, and inline date chips; strip every other `omd:` comment (keeping its body, e.g. a
 * chart's SVG+table). Recurses into container children so nested blocks are handled too.
 */
function processChildren(children: MdNode[]): MdNode[] {
  const out: MdNode[] = [];
  let skipLinkcardBody = false;

  for (const node of children) {
    if (node.type === 'html' && typeof node.value === 'string') {
      const open = matchOpen(node.value);
      if (open) {
        const params = parseParams(open.params);
        if (open.name === 'callout') out.push(html(calloutOpen(params)));
        else if (open.name === 'linkcard') {
          out.push(html(linkcardHtml(params)));
          skipLinkcardBody = true; // the `[title](url)` body is the GFM fallback — drop it
        } else if (open.name === 'tabs') out.push(html('<div class="omd-tabs-export">'));
        else if (open.name === 'tab')
          out.push(html(`<section class="omd-tab-export"><div class="omd-tab-label">${esc(String(params.label ?? ''))}</div>`));
        else if (open.name === 'gallery') {
          // The body is one-image-per-paragraph markdown; wrap it in a grid so it reads as a
          // gallery, not a flat list. A fixed `columns` param overrides the auto-fill grid.
          const cols = params.columns;
          const attr = cols && cols !== 'auto' ? ` data-columns="${esc(String(cols))}"` : '';
          out.push(html(`<div class="omd-gallery-export"${attr}>`));
        }
        // else: an unstyled container (chart/youtube/…) — strip the comment, keep the body.
        continue;
      }
      const close = matchClose(node.value);
      if (close) {
        if (close.name === 'linkcard') skipLinkcardBody = false;
        else if (close.name === 'callout' || close.name === 'tabs' || close.name === 'gallery')
          out.push(html('</div>'));
        else if (close.name === 'tab') out.push(html('</section>'));
        // else: matching close of an unstyled container — strip it.
        continue;
      }
    }
    if (skipLinkcardBody) continue;
    if (node.children) node.children = processChildren(node.children);
    out.push(node);
  }
  return out;
}

/** Replace inline date tokens inside text nodes throughout the tree. */
function transformDates(node: MdNode): void {
  if (!node.children) return;
  const next: MdNode[] = [];
  for (const child of node.children) {
    if (child.type === 'text' && typeof child.value === 'string') {
      const split = splitDateTokens(child.value);
      if (split) {
        next.push(...split);
        continue;
      }
    }
    transformDates(child);
    next.push(child);
  }
  node.children = next;
}

/** The remark plugin: run the block rewrite, then the inline date-token pass. */
export function omdBlocksRemark() {
  return (tree: MdNode) => {
    if (tree.children) tree.children = processChildren(tree.children);
    transformDates(tree);
  };
}

/**
 * Styling for the OMD-look export, mirroring the editor's block appearance with concrete light
 * colors (the editor's `var(--vscode-*)` don't exist outside VS Code). Injected into the export
 * shell after github-markdown-css. Content only — no editing chrome exists to style.
 */
export const OMD_EXPORT_CSS = `
/* Smart callout — accent bar, tint, icon, bold first-line title. */
.omd-callout {
  position: relative;
  margin: 0 0 16px 0;
  padding: 8px 16px 8px 40px;
  border-left: 3px solid var(--omd-accent, #4daafc);
  border-radius: 6px;
  background: color-mix(in srgb, var(--omd-accent, #4daafc) 8%, transparent);
}
.omd-callout-icon {
  position: absolute;
  top: 10px;
  left: 14px;
  display: flex;
  color: var(--omd-accent, #4daafc);
}
.omd-callout > blockquote {
  margin: 0;
  border: none;
  padding: 0;
  background: transparent;
  color: inherit;
}
.omd-callout > blockquote > :first-child {
  margin-top: 0;
  color: var(--omd-accent, #4daafc);
  font-weight: 600;
}
.omd-callout > blockquote > :last-child { margin-bottom: 0; }

/* Date chip. */
.omd-date-chip {
  background: rgba(27, 31, 36, 0.06);
  border-radius: 2em;
  padding: 1px 8px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* Link card — thumbnail + title/description/site, no action bar. */
.omd-linkcard {
  display: flex;
  align-items: stretch;
  gap: 12px;
  text-decoration: none !important;
  color: inherit;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  overflow: hidden;
  background: #f6f8fa;
  margin: 0 0 16px 0;
}
.omd-linkcard-image { order: -1; flex: 0 0 auto; width: 30%; max-width: 12rem; object-fit: cover; }
.omd-linkcard-text { display: flex; flex-direction: column; gap: 3px; padding: 12px; min-width: 0; }
.omd-linkcard-title { font-weight: 600; }
.omd-linkcard-desc { font-size: 0.9em; opacity: 0.85; }
.omd-linkcard-site { font-size: 0.8em; opacity: 0.6; margin-top: auto; }

/* Gallery — an image grid (mirrors the editor). Auto-fill by default; a fixed columns param wins.
   Images are one-or-more per markdown paragraph, so make the paragraph transparent (display:contents)
   and each image a grid cell directly. */
.omd-gallery-export {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
  margin: 0 0 16px 0;
}
.omd-gallery-export[data-columns="2"] { grid-template-columns: repeat(2, 1fr); }
.omd-gallery-export[data-columns="3"] { grid-template-columns: repeat(3, 1fr); }
.omd-gallery-export[data-columns="4"] { grid-template-columns: repeat(4, 1fr); }
.omd-gallery-export > p { display: contents; margin: 0; }
.omd-gallery-export img {
  width: 100%;
  display: block;
  border-radius: 4px;
  /* Uniform 4/3 cells with the image contained + centered (letterboxed), matching the editor —
     a square logo keeps its shape, off-ratio images sit centered against a subtle fill. */
  aspect-ratio: 4 / 3;
  object-fit: contain;
  background: rgba(127, 127, 127, 0.08);
}

/* Tabs — rendered as labeled, stacked sections (static; no switch controls). */
.omd-tabs-export { margin: 0 0 16px 0; border: 1px solid #d0d7de; border-radius: 6px; overflow: hidden; }
.omd-tab-export { border-top: 1px solid #d0d7de; padding: 12px 16px; }
.omd-tab-export:first-child { border-top: none; }
.omd-tab-label {
  font-size: 0.8em;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  opacity: 0.6;
  margin-bottom: 6px;
}

@media (prefers-color-scheme: dark) {
  .omd-date-chip { background: rgba(255, 255, 255, 0.1); }
  .omd-linkcard { border-color: #30363d; background: #161b22; }
  .omd-tabs-export, .omd-tab-export { border-color: #30363d; }
}
`;
