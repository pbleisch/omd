import { splitThreads } from '../shared/threads';
import { mathRenderer } from './math-svg';
import { renderGitHubHtml } from '../shared/github-render';
import { SHIKI_CSS } from '../shared/shiki-css';
import { omdBlocksRemark, OMD_EXPORT_CSS } from '../shared/omd-blocks';
import { sanitizeExportHtml } from './sanitize-html';

/**
 * Export a document to a self-contained HTML file that **preserves the OMD view** —
 * the finished document you see in the editor, not the plain-GitHub rendering (that's what the live
 * GitHub-preview panel is for). It shares the base pipeline with the preview (`github-render.ts`:
 * GFM, Shiki highlighting, frontmatter table, math) but adds the OMD-block transform
 * (`shared/omd-blocks.ts`), which renders smart callouts, link cards, date chips, and tabs in their
 * OMD-styled form — **content only, no editing chrome**. Coexistence forms (chart SVG+table,
 * columns, `<details>`, media, aligned divs) already render via raw-HTML passthrough.
 *
 * Math is **MathJax** (host-side LaTeX → self-contained SVG, no fonts) — a deliberately different
 * engine from the editor's KaTeX. Thread metadata is stripped first. True PDF needs a browser engine
 * OMD does not bundle, so the exported HTML is print-ready and PDF is print-from-the-page.
 */

/**
 * Render a markdown body to an OMD-styled HTML fragment (no shell), with MathJax for math. The
 * output is sanitized (threat-model R1): the exported file has no CSP, so any active content the
 * source doc smuggled in via raw HTML (`<script>`, `onclick=`, `javascript:` URLs) is stripped while
 * the trusted injected SVG / highlighted code / block wrappers are preserved.
 */
export async function markdownToHtmlFragment(
  markdown: string,
  repoSlug?: { owner: string; repo: string }
): Promise<string> {
  const rendered = await renderGitHubHtml(markdown, {
    // MathJax is loaded here, and only for a document that actually has math.
    renderMath: await mathRenderer(markdown),
    extraRemarkPlugins: [omdBlocksRemark],
    repoSlug
  });
  return sanitizeExportHtml(rendered);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Wrap an HTML fragment in a self-contained, print-ready document. */
/**
 * A `<script>` that renders the `<pre class="mermaid">` blocks in the exported file, added to the
 * shell (never the sanitized fragment) only when the document actually has a diagram and the caller
 * supplied the mermaid runtime. This is what makes an exported file show diagrams **offline** —
 * OMD bundles no browser engine to pre-render them host-side, so the runtime rides along in-file.
 */
function mermaidScript(runtime: string): string {
  return `<script>${runtime}</script>
<script>
  (function () {
    if (!window.mermaid) return;
    var dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    window.mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'default', securityLevel: 'strict' });
    window.mermaid.run({ querySelector: 'pre.mermaid' });
  })();
</script>`;
}

export function buildHtmlDocument(
  fragment: string,
  title: string,
  css: string,
  mermaidRuntime?: string
): string {
  const mermaid =
    mermaidRuntime && /class="mermaid"/.test(fragment) ? `\n${mermaidScript(mermaidRuntime)}` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title)}</title>
<style>
${css}
${SHIKI_CSS}
${OMD_EXPORT_CSS}
/* Whole-page canvas, matching the editor: the entire page (not just the centered column) takes the
   GitHub canvas colour, dark under a dark colour scheme. */
html { color-scheme: light dark; }
body { margin: 0; background: #ffffff; color: #1f2328; }
@media (prefers-color-scheme: dark) {
  body { background: #0d1117; color: #e6edf3; }
}
.markdown-body {
  box-sizing: border-box;
  max-width: 860px;
  margin: 0 auto;
  padding: 32px 24px;
  background: transparent;
}
@media print { .markdown-body { max-width: none; } }
mjx-container svg, .markdown-body svg { max-width: 100%; }
pre.mermaid { text-align: center; background: none; }
</style>
</head>
<body>
<article class="markdown-body">
${fragment}
</article>${mermaid}
</body>
</html>`;
}

/** The full export: strip thread metadata, render, and wrap. `mermaidRuntime` (when supplied and the
 *  document has a diagram) is inlined so the file renders mermaid offline. */
export async function exportToHtml(
  markdown: string,
  title: string,
  css: string,
  mermaidRuntime?: string,
  repoSlug?: { owner: string; repo: string }
): Promise<string> {
  const { body } = splitThreads(markdown);
  const fragment = await markdownToHtmlFragment(body, repoSlug);
  return buildHtmlDocument(fragment, title, css, mermaidRuntime);
}
