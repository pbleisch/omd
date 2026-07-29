import { describe, it, expect } from 'vitest';
import { renderTemplate } from '../src/webview/blocks/template';
import { renderLeafOutput } from '../src/webview/blocks/render';
import type { BlockDefinition } from '../src/shared/blocks';

/**
 * P4 trust-tier rendering. The template tier is an eval-free, CSP-safe substitution engine
 * (the webview CSP forbids Handlebars' `new Function`); the built-in tier is trusted shipped
 * code. These tests pin escaping (the security-relevant part) and tier dispatch.
 */

describe('safe template tier', () => {
  it('interpolates and HTML-escapes values', () => {
    expect(renderTemplate('Hi {{name}}', { name: 'Ann' })).toBe('Hi Ann');
    expect(renderTemplate('{{x}}', { x: '<script>alert(1)</script>' })).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    );
    expect(renderTemplate('{{x}}', { x: `a"b'c&d` })).toBe('a&quot;b&#39;c&amp;d');
  });

  it('supports raw triple-stache for trusted markup', () => {
    expect(renderTemplate('{{{html}}}', { html: '<b>x</b>' })).toBe('<b>x</b>');
  });

  it('resolves dotted paths and missing values to empty', () => {
    expect(renderTemplate('{{a.b}}', { a: { b: 'deep' } })).toBe('deep');
    expect(renderTemplate('{{a.b}}', {})).toBe('');
  });

  it('handles if / unless sections', () => {
    expect(renderTemplate('{{#if on}}Y{{/if}}', { on: true })).toBe('Y');
    expect(renderTemplate('{{#if on}}Y{{/if}}', { on: false })).toBe('');
    expect(renderTemplate('{{#unless on}}N{{/unless}}', { on: false })).toBe('N');
  });

  it('iterates each with this and object keys', () => {
    expect(renderTemplate('{{#each xs}}[{{this}}]{{/each}}', { xs: [1, 2, 3] })).toBe('[1][2][3]');
    expect(
      renderTemplate('{{#each rows}}{{label}};{{/each}}', { rows: [{ label: 'a' }, { label: 'b' }] })
    ).toBe('a;b;');
    expect(renderTemplate('{{#each xs}}x{{/each}}', { xs: [] })).toBe('');
  });
});

describe('leaf output tier dispatch', () => {
  const def = (over: Partial<BlockDefinition>): BlockDefinition => ({
    name: 'x',
    title: 'X',
    kind: 'leaf',
    trust: 'template',
    source: 'workspace',
    ...over
  });

  it('renders the built-in date block', () => {
    const out = renderLeafOutput(def({ name: 'date', trust: 'builtin' }), { value: '2026-01-02' });
    expect(out?.textContent).toContain('2026-01-02');
    expect(out?.querySelector('.omd-block-date-value')).toBeTruthy();
  });

  it('renders a template block and strips dangerous markup', () => {
    const out = renderLeafOutput(
      def({ template: 'Q: {{q}} <script>evil()</script><img src=x onerror="bad()">' }),
      { q: 'why?' }
    );
    expect(out?.textContent).toContain('Q: why?');
    expect(out?.querySelector('script')).toBeNull(); // forbidden element removed
    const img = out?.querySelector('img');
    expect(img?.getAttribute('onerror')).toBeNull(); // handler attribute stripped
  });

  it('escapes a value that tries to inject a handler', () => {
    const out = renderLeafOutput(def({ template: '{{v}}' }), {
      v: '<img src=x onerror=alert(1)>'
    });
    // The whole value is escaped to text, so no element is created at all.
    expect(out?.querySelector('img')).toBeNull();
    expect(out?.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('returns null when no tier applies', () => {
    expect(renderLeafOutput(def({}), {})).toBeNull();
  });

  it('renders sandboxed author code in an isolated iframe', () => {
    const out = renderLeafOutput(
      def({ trust: 'sandboxed', script: 'root.textContent = params.q' }),
      { q: 'hi' }
    );
    const frame = out?.querySelector('iframe.omd-sandbox-frame') as HTMLIFrameElement | null;
    expect(frame).toBeTruthy();
    // The security-critical guarantees: scripts allowed, but NOT same-origin, and its CSP
    // blocks the network. Losing any of these would break the isolation the tier promises.
    expect(frame?.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame?.getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(frame?.srcdoc).toContain("default-src 'none'");
  });

  it('does not sandbox-render when the definition has no script', () => {
    expect(renderLeafOutput(def({ trust: 'sandboxed' }), {})).toBeNull();
  });
});
