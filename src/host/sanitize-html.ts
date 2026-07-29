import { fromHtml } from 'hast-util-from-html';
import { toHtml } from 'hast-util-to-html';
import { visit, SKIP } from 'unist-util-visit';

/**
 * Sanitize the HTML export against active content carried by a malicious source document
 * (threat-model R1). The export writes a self-contained HTML file the user opens in a browser with
 * **no CSP**, so a `<script>`, an `onclick=` handler, or a `javascript:` URL in the source doc's raw
 * HTML would run. (The live GitHub-preview panel doesn't need this — it renders under the webview's
 * strict nonce CSP, which already blocks injected scripts.)
 *
 * A **targeted denylist**, not a strict allowlist: the export deliberately injects rich trusted
 * content — MathJax/Chart SVG, Shiki-highlighted spans with inline `style`, the OMD-block wrappers —
 * that a from-scratch allowlist would have to enumerate attribute-by-attribute (and silently break
 * when it misses one). Removing the known execution vectors instead preserves all of that while
 * closing the actual holes: script-bearing elements, event handlers, and script-scheme URLs. SVG is
 * kept, but its script-capable elements (`<script>`, `<foreignObject>`) are removed.
 */

/** Elements removed wholesale (script execution, embedding, or navigation hijack). */
const DANGEROUS_TAGS = new Set([
  'script',
  'iframe',
  'object',
  'embed',
  'foreignobject', // inside SVG — can host arbitrary HTML/script
  'form',
  'base',
  'link',
  'meta',
  'noscript'
]);

/** A URL value that can execute script when navigated/loaded. */
function isDangerousUrl(value: string): boolean {
  // Strip control chars/whitespace that browsers ignore inside the scheme (e.g. `java\tscript:`).
  // eslint-disable-next-line no-control-regex -- stripping control chars is the point here
  const v = value.replace(/[\s\x00-\x1f]+/g, '').toLowerCase();
  return /^(javascript|vbscript|data:text\/html|data:application\/xhtml)/.test(v);
}

/** Return sanitized HTML for `html` (a rendered fragment): no scripts, handlers, or script URLs. */
export function sanitizeExportHtml(html: string): string {
  const tree = fromHtml(html, { fragment: true });

  visit(tree, 'element', (node, index, parent) => {
    if (parent && typeof index === 'number' && DANGEROUS_TAGS.has(node.tagName.toLowerCase())) {
      parent.children.splice(index, 1);
      return [SKIP, index]; // re-visit whatever shifted into this slot
    }
    const props = node.properties ?? {};
    for (const key of Object.keys(props)) {
      const value = props[key];
      // Event handlers (`onClick`, `onload`, … however property-information cased them).
      if (/^on/i.test(key)) {
        delete props[key];
        continue;
      }
      if (typeof value === 'string' && isDangerousUrl(value)) delete props[key];
    }
    return undefined;
  });

  return toHtml(tree);
}
