/**
 * LaTeX → SVG for export, using MathJax host-side. This is intentionally a *second* math
 * engine, distinct from the editor's KaTeX (docs/design/DEPENDENCIES.md): a full TeX setup is cheap in
 * Node and produces self-contained SVG that needs no fonts or scripts in the exported file.
 *
 * MathJax is the single heaviest thing in the host bundle, so it is behind a dynamic import
 * (`math-svg-mathjax.ts`) and only loaded for a document that actually contains math
 * (docs/operations/PERFORMANCE.md). Callers await `mathRenderer(markdown)` once, up front, and
 * then render synchronously — the remark pipeline's `renderMath` hook is synchronous.
 */

type Tex2Svg = (tex: string, display: boolean) => string;

let convert: Tex2Svg | null = null;

/** Load MathJax once and return the converter. Concurrent callers share the one load. */
export async function loadTex2Svg(): Promise<Tex2Svg> {
  if (!convert) {
    const { createConverter } = await import('./math-svg-mathjax');
    convert ??= createConverter();
  }
  return convert;
}

/**
 * Could this markdown contain math at all? remark-math needs a `$` to open a `$…$` or `$$…$$`
 * span, so a document without one provably has none — and never loads MathJax. Deliberately
 * conservative: a stray `$` costs a load that renders nothing, which is only slow, never wrong.
 */
export function mayContainMath(markdown: string): boolean {
  return markdown.includes('$');
}

/**
 * The `renderMath` hook for a document, or `undefined` when it has no math — in which case the
 * pipeline leaves `$…$` as literal text, exactly as it does today for a math-free document.
 */
export async function mathRenderer(markdown: string): Promise<Tex2Svg | undefined> {
  if (!mayContainMath(markdown)) return undefined;
  const tex2svg = await loadTex2Svg();
  /** Render one LaTeX string to an SVG HTML string; falls back to the raw TeX on error. */
  return (latex: string, display: boolean) => {
    try {
      return tex2svg(latex, display);
    } catch {
      const tag = display ? 'div' : 'span';
      const esc = latex.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      return `<${tag} class="omd-math-error">${esc}</${tag}>`;
    }
  };
}
