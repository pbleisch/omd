import { describe, it, expect } from 'vitest';
import { sanitizeExportHtml } from '../src/host/sanitize-html';

/**
 * The HTML-export sanitizer (threat-model R1): the exported file has no CSP, so active content the
 * source doc smuggled in must be stripped, while the export's own trusted rich content is preserved.
 */

describe('sanitizeExportHtml — strips execution vectors', () => {
  it('removes <script> elements', () => {
    expect(sanitizeExportHtml('<p>hi</p><script>alert(1)</script>')).not.toContain('alert(1)');
  });
  it('removes event-handler attributes', () => {
    const out = sanitizeExportHtml('<div onclick="evil()">x</div>');
    expect(out).not.toMatch(/onclick/i);
    expect(out).toContain('x'); // the element itself stays
  });
  it('removes javascript: and vbscript: URLs', () => {
    expect(sanitizeExportHtml('<a href="javascript:alert(1)">x</a>')).not.toMatch(/javascript:/i);
    expect(sanitizeExportHtml('<a href="vbscript:msgbox(1)">x</a>')).not.toMatch(/vbscript:/i);
  });
  it('removes data:text/html URLs but keeps data:image', () => {
    expect(sanitizeExportHtml('<a href="data:text/html,<script>">x</a>')).not.toContain('data:text/html');
    expect(sanitizeExportHtml('<img src="data:image/png;base64,AAAA">')).toContain('data:image/png');
  });
  it('removes iframe/object/embed and svg foreignObject', () => {
    expect(sanitizeExportHtml('<iframe src="x"></iframe>')).not.toContain('<iframe');
    expect(sanitizeExportHtml('<object data="x"></object>')).not.toContain('<object');
    expect(sanitizeExportHtml('<svg><foreignObject><script>x</script></foreignObject></svg>')).not.toContain(
      'foreignObject'
    );
  });
  it('defeats control-char obfuscation of the scheme', () => {
    expect(sanitizeExportHtml('<a href="java\tscript:alert(1)">x</a>')).not.toMatch(/script:alert/i);
  });
});

describe('sanitizeExportHtml — preserves legitimate content', () => {
  it('keeps http(s) links, images, and coexistence forms', () => {
    const out = sanitizeExportHtml(
      '<a href="https://example.com">x</a><img src="pic.png"><div align="center"><p>y</p></div><details><summary>s</summary>b</details>'
    );
    expect(out).toContain('https://example.com');
    expect(out).toContain('<img');
    expect(out).toMatch(/align="center"/);
    expect(out).toContain('<details');
  });
  it('keeps SVG (math/charts) and inline styles (Shiki)', () => {
    const out = sanitizeExportHtml('<svg viewBox="0 0 10 10"><path d="M0 0" fill="#f00"/></svg><span style="color:#0f0">c</span>');
    expect(out).toContain('<svg');
    expect(out).toContain('<path');
    expect(out).toContain('style="color:#0f0"');
  });
});
