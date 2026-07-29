import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';

/**
 * LaTeX → SVG for export, using MathJax host-side. This is intentionally a *second* math
 * engine, distinct from the editor's KaTeX (docs/design/DEPENDENCIES.md): a full TeX setup is cheap in
 * Node and produces self-contained SVG that needs no fonts or scripts in the exported file.
 * The document is built once and reused across every equation.
 */

let convert: ((tex: string, display: boolean) => string) | null = null;

function ensure(): (tex: string, display: boolean) => string {
  if (convert) return convert;
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const tex = new TeX({ packages: AllPackages });
  // `fontCache: 'none'` keeps every SVG independent, so a single equation copied out still
  // renders — no shared <defs> to leave behind.
  const svg = new SVG({ fontCache: 'none' });
  const doc = mathjax.document('', { InputJax: tex, OutputJax: svg });

  convert = (latex: string, display: boolean) => {
    const node = doc.convert(latex, { display });
    return adaptor.outerHTML(node);
  };
  return convert;
}

/** Render one LaTeX string to an SVG HTML string; falls back to the raw TeX on error. */
export function tex2svg(latex: string, display: boolean): string {
  try {
    return ensure()(latex, display);
  } catch {
    const tag = display ? 'div' : 'span';
    const esc = latex.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return `<${tag} class="omd-math-error">${esc}</${tag}>`;
  }
}
