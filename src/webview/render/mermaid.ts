import mermaid from 'mermaid';

/**
 * Mermaid diagrams (docs/design/DEPENDENCIES.md — v11 specifically; earlier majors render
 * differently). A ```mermaid fence *is* a diagram (a native pattern, docs/design/SMART-BLOCKS.md),
 * so OMD renders it richly with no shortcode. Theme follows the VS Code theme kind.
 */
let initialized = false;
let idSeq = 0;

function ensureInit(): void {
  const dark = !document.body.classList.contains('vscode-light');
  mermaid.initialize({
    startOnLoad: false,
    theme: dark ? 'dark' : 'default',
    securityLevel: 'strict',
    // Render labels as SVG <text>, not HTML in <foreignObject>. Besides being self-contained,
    // this keeps the SVG rasterizable — a <foreignObject> taints a canvas, which would break
    // "copy as image" (block-actions copySvgPreview). Set across the diagram types that use it.
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    class: { htmlLabels: false }
  });
  initialized = true;
}

/** Render mermaid source to SVG markup. Throws on invalid diagrams (caller shows the error). */
export async function renderMermaid(code: string): Promise<string> {
  if (!initialized) ensureInit();
  const id = `omd-mermaid-${idSeq++}`;
  const { svg } = await mermaid.render(id, code);
  return svg;
}
