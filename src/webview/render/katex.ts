import katex from 'katex';

/**
 * Math rendering with KaTeX (docs/design/DEPENDENCIES.md — fast, no network). We emit MathML,
 * which the browser renders with its own math fonts, so the sandboxed webview needs no
 * KaTeX font files or external stylesheet. `throwOnError: false` renders a malformed
 * expression in red rather than throwing — real feedback, never a dead box.
 */
const cache = new Map<string, string>();

export function renderMath(tex: string, displayMode: boolean): string {
  const key = (displayMode ? 'D:' : 'I:') + tex;
  const hit = cache.get(key);
  if (hit != null) return hit;
  const html = katex.renderToString(tex, {
    output: 'mathml',
    throwOnError: false,
    displayMode
  });
  cache.set(key, html);
  return html;
}
