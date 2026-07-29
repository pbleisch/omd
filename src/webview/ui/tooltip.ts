/**
 * A small custom tooltip. Native `title` tooltips render inconsistently inside the VS Code
 * webview (some show, some don't, with no DOM difference), so chrome that wants a reliable
 * hint uses this instead: one shared element, shown on hover after a short delay, positioned
 * under the target (flipping above when it would clip). Accessibility still comes from the
 * element's `aria-label`; this is purely the visible hint.
 */

let tip: HTMLElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

function ensureTip(): HTMLElement {
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'omd-tooltip';
    tip.style.display = 'none';
    document.body.appendChild(tip);
  }
  return tip;
}

function hide(): void {
  if (timer) {
    clearTimeout(timer);
    timer = undefined;
  }
  if (tip) tip.style.display = 'none';
}

function show(el: HTMLElement, text: string): void {
  const t = ensureTip();
  t.textContent = text;
  t.style.display = '';
  const r = el.getBoundingClientRect();
  const tr = t.getBoundingClientRect();
  const vw = window.innerWidth || 0;
  const vh = window.innerHeight || 0;
  let left = r.left + r.width / 2 - tr.width / 2;
  if (vw > 0) left = Math.max(4, Math.min(left, vw - tr.width - 4));
  let top = r.bottom + 6;
  if (vh > 0 && top + tr.height > vh) top = r.top - tr.height - 6;
  t.style.left = `${Math.round(left)}px`;
  t.style.top = `${Math.round(Math.max(top, 4))}px`;
}

/** Show `text` when the pointer rests on `el`; hide on leave, press, or blur. */
export function attachTooltip(el: HTMLElement, text: string): void {
  if (!text) return;
  el.addEventListener('mouseenter', () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => show(el, text), 400);
  });
  el.addEventListener('mouseleave', hide);
  el.addEventListener('mousedown', hide);
}
