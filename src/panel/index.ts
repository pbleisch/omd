import mermaid from 'mermaid';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

/**
 * The GitHub-preview panel's tiny client. The host renders the document to GitHub-faithful HTML
 * (shared/github-render.ts, MathJax for math) and posts it here; this sets it as the content and
 * renders the `<pre class="mermaid">` blocks the renderer emitted — the one thing that needs a
 * browser (math already arrives as self-contained SVG). Runs under the same strict nonce CSP as the
 * editor, where mermaid is known to work.
 */

const vscodeApi = acquireVsCodeApi();
const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'default', securityLevel: 'strict' });

const content = document.getElementById('omd-preview')!;
let renderSeq = 0;

interface HtmlMessage {
  type: 'html';
  html: string;
}

window.addEventListener('message', (event: MessageEvent<HtmlMessage>) => {
  if (event.data?.type !== 'html') return;
  content.innerHTML = event.data.html;
  void renderMermaid();
});

async function renderMermaid(): Promise<void> {
  const blocks = Array.from(content.querySelectorAll<HTMLElement>('pre.mermaid'));
  const pass = ++renderSeq;
  for (const el of blocks) {
    const code = el.textContent ?? '';
    try {
      const { svg } = await mermaid.render(`omd-mermaid-${pass}-${Math.random().toString(36).slice(2)}`, code);
      if (pass !== renderSeq) return; // a newer document arrived; abandon this pass
      const wrap = document.createElement('div');
      wrap.className = 'omd-mermaid';
      wrap.innerHTML = svg;
      el.replaceWith(wrap);
    } catch (err) {
      el.setAttribute('data-mermaid-error', 'true');
      el.title = `Mermaid error: ${String(err)}`;
    }
  }
}

// Tell the host we're ready so it sends the first render (covers the panel opening after the doc).
vscodeApi.postMessage({ type: 'ready' });
