import type { BlockDefinition } from '../../shared/blocks';

/**
 * The sandboxed trust tier (docs/design/SMART-BLOCKS.md, "Safety"): author render code runs in an
 * isolated iframe with **no page access and no network**. The frame is `sandbox="allow-
 * scripts"` *without* `allow-same-origin`, so it is a unique opaque origin that cannot reach
 * the editor's DOM, cookies, or storage. Its own CSP (`default-src 'none'`) blocks every
 * network fetch; `'unsafe-eval'` is allowed *only inside this jail*, which is what lets the
 * author's code string run at all — safely, because the jail can touch nothing outside it.
 *
 * Protocol: the frame announces `omd-ready`; the parent sends `omd-render {code, params}`;
 * the frame runs `new Function('params','root', code)` and reports its content height back
 * so the parent can size the frame. The parent only trusts messages from this exact frame.
 */

/** The iframe document: a render harness locked down by its own CSP. */
const SANDBOX_SRCDOC = `<!doctype html><html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data:">
<style>
  html,body{margin:0;padding:0;font:14px/1.5 -apple-system,"Segoe UI",sans-serif;color:#ddd;background:transparent}
  #root{padding:12px 16px}
  .omd-sandbox-error{color:#f85149;font-family:monospace;font-size:.85em;padding:12px 16px}
</style></head><body><div id="root"></div>
<script>
  var root = document.getElementById('root');
  addEventListener('message', function (e) {
    var msg = e.data;
    if (!msg || msg.type !== 'omd-render') return;
    root.textContent = '';
    try {
      // The author body runs with only 'params' and 'root' in scope — no parent, no net.
      (new Function('params', 'root', msg.code))(msg.params, root);
    } catch (err) {
      root.textContent = '';
      var pre = document.createElement('div');
      pre.className = 'omd-sandbox-error';
      pre.textContent = 'Block error: ' + (err && err.message ? err.message : String(err));
      root.appendChild(pre);
    }
    var h = document.documentElement.scrollHeight;
    parent.postMessage({ type: 'omd-height', id: msg.id, height: h }, '*');
  });
  parent.postMessage({ type: 'omd-ready' }, '*');
</script></body></html>`;

export { SANDBOX_SRCDOC };

let nextId = 0;

/**
 * Render a block through the sandbox. Returns immediately with a host element containing the
 * iframe; the frame fills in and self-sizes once its harness is ready. Returns null if the
 * definition carries no author code.
 */
export function renderSandboxed(
  def: BlockDefinition,
  params: Record<string, unknown>
): HTMLElement | null {
  if (!def.script) return null;
  const code = def.script;

  const wrap = document.createElement('div');
  wrap.className = 'omd-block-output omd-block-sandbox';

  const frame = document.createElement('iframe');
  frame.className = 'omd-sandbox-frame';
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('title', `Sandboxed block: ${def.name}`);
  frame.srcdoc = SANDBOX_SRCDOC;

  const id = `omd-${nextId++}`;
  const onMessage = (e: MessageEvent) => {
    // Only ever trust the frame we created — never any other window.
    if (e.source !== frame.contentWindow) return;
    const msg = e.data as { type?: string; id?: string; height?: number };
    if (msg?.type === 'omd-ready') {
      frame.contentWindow?.postMessage({ type: 'omd-render', id, code, params }, '*');
    } else if (msg?.type === 'omd-height' && msg.id === id) {
      frame.style.height = `${Math.max(0, Number(msg.height) || 0)}px`;
    }
  };
  window.addEventListener('message', onMessage);
  // Drop the listener when the frame leaves the document, so blocks don't leak listeners.
  frame.addEventListener('omd-teardown', () => window.removeEventListener('message', onMessage));

  wrap.appendChild(frame);
  return wrap;
}
