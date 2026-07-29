import type { BlockDefinition } from '../../shared/blocks';
import { renderTemplate } from './template';
import { renderSandboxed } from './sandbox';

/**
 * Trust-tiered rendering of a leaf block's output (docs/design/SMART-BLOCKS.md, "Safety"):
 *
 *   - `builtin`  — a render function OMD ships, trusted to run in the editor. Only shipped
 *                  definitions reach this tier (enforced at manifest parse).
 *   - `template` — the safe eval-free substitution tier (see ./template). Its output is
 *                  additionally sanitized here as defense-in-depth behind the webview CSP.
 *   - (sandboxed author code renders in an isolated iframe — a later increment.)
 *
 * Returns the element to show as the block's body, or null to fall back to plain chrome.
 */

type BuiltinRenderer = (params: Record<string, unknown>, def: BlockDefinition) => HTMLElement;

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Shipped, trusted-in-editor renderers, keyed by block name. */
const BUILTIN_RENDERERS: Record<string, BuiltinRenderer> = {
  date: (params) => {
    const value = typeof params.value === 'string' ? params.value : '';
    const out = el('div', 'omd-block-output omd-block-date');
    out.append(el('span', 'omd-block-date-icon', '📅'));
    out.append(el('span', 'omd-block-date-value', value || 'no date'));
    return out;
  }
};

/** Elements never allowed in template output; a value can never reintroduce them (escaped). */
const FORBIDDEN = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'BASE']);

/**
 * Conservative sanitizer for template-tier HTML. The strict webview CSP already blocks
 * inline handlers and script execution; this removes the dangerous nodes/attributes anyway
 * so template output is safe even outside that CSP (e.g. the dev preview).
 */
function sanitize(html: string): HTMLElement {
  const host = el('div', 'omd-block-output');
  host.innerHTML = html;
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_ELEMENT);
  const toRemove: Element[] = [];
  let node = walker.nextNode() as Element | null;
  while (node) {
    if (FORBIDDEN.has(node.tagName)) {
      toRemove.push(node);
    } else {
      for (const attr of [...node.attributes]) {
        const name = attr.name.toLowerCase();
        const val = attr.value.replace(/\s/g, '').toLowerCase();
        if (name.startsWith('on') || (/^(href|src|xlink:href)$/.test(name) && val.startsWith('javascript:'))) {
          node.removeAttribute(attr.name);
        }
      }
    }
    node = walker.nextNode() as Element | null;
  }
  for (const n of toRemove) n.remove();
  return host;
}

/** Render a leaf block's output for the given params, or null if no tier applies. */
export function renderLeafOutput(
  def: BlockDefinition,
  params: Record<string, unknown>
): HTMLElement | null {
  if (def.trust === 'builtin' && BUILTIN_RENDERERS[def.name]) {
    return BUILTIN_RENDERERS[def.name](params, def);
  }
  if (def.trust === 'sandboxed' && def.script) {
    return renderSandboxed(def, params);
  }
  if (def.template) {
    return sanitize(renderTemplate(def.template, params));
  }
  return null;
}
