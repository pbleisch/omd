import type { Mermaid } from 'mermaid';
import { loadGlobal } from '../lazy/sidecar';

/**
 * Mermaid diagrams (docs/design/DEPENDENCIES.md — v11 specifically; earlier majors render
 * differently). A ```mermaid fence *is* a diagram (a native pattern, docs/design/SMART-BLOCKS.md),
 * so OMD renders it richly with no shortcode. Theme follows the VS Code theme kind.
 *
 * The runtime is **not** bundled: `media/mermaid.min.js` — the same standalone build the HTML
 * export inlines, already in the `.vsix` — is loaded on the first diagram (`lazy/sidecar.ts`). It
 * is over half of what the editor bundle used to weigh, and a prose document never touches it.
 */
declare global {
  interface Window {
    /** Set by `media/mermaid.min.js`; the same object `import mermaid from 'mermaid'` gives. */
    mermaid?: Mermaid;
  }
}

let ready: Mermaid | null = null;
let idSeq = 0;

async function ensureMermaid(): Promise<Mermaid> {
  if (ready) return ready;
  const mermaid = await loadGlobal('mermaid.min.js', () => window.mermaid);
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
  ready = mermaid;
  return mermaid;
}

/** Whether the runtime is already loaded — i.e. whether the next render is instant. */
export function mermaidReady(): boolean {
  return ready !== null;
}

/** Render mermaid source to SVG markup. Throws on invalid diagrams (caller shows the error). */
export async function renderMermaid(code: string): Promise<string> {
  const mermaid = await ensureMermaid();
  const id = `omd-mermaid-${idSeq++}`;
  const { svg } = await mermaid.render(id, code);
  return svg;
}
