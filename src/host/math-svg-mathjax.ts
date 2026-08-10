import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';

/**
 * The MathJax engine itself — ~2.5 MB, kept behind `math-svg.ts` so it is imported (and its TeX
 * package tables built) only when a document being exported or previewed actually has math, never
 * at activation. Nothing outside `math-svg.ts` should import this module.
 */

/** Build the TeX → SVG converter. The document is built once and reused across every equation. */
export function createConverter(): (tex: string, display: boolean) => string {
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const tex = new TeX({ packages: AllPackages });
  // `fontCache: 'none'` keeps every SVG independent, so a single equation copied out still
  // renders — no shared <defs> to leave behind.
  const svg = new SVG({ fontCache: 'none' });
  const doc = mathjax.document('', { InputJax: tex, OutputJax: svg });

  return (latex: string, display: boolean) => {
    const node = doc.convert(latex, { display });
    return adaptor.outerHTML(node);
  };
}
