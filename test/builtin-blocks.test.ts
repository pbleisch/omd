import { describe, it, expect } from 'vitest';
import { mountEditor, roundTrip } from './helpers/editor';
import { collectHeadings, renderToc } from '../src/webview/blocks/toc';
import { normalizeMarkdown } from '../src/shared/roundtrip';

/**
 * P5 built-in blocks. The phase's exit requires a per-block round-trip test, so every
 * built-in that is finished earns a row here — a regression in this suite means a block
 * stopped being portable. `toc` also gets behaviour tests: its output is *derived* from the
 * document, so it must never leak into the bytes on disk.
 */

describe('toc block', () => {
  it('collects headings in document order with their levels', async () => {
    const { handle } = await mountEditor('# One\n\n## Two\n\n### Three\n\ntext\n');
    const headings = collectHeadings(handle.getView());
    expect(headings.map((h) => [h.level, h.text])).toEqual([
      [1, 'One'],
      [2, 'Two'],
      [3, 'Three']
    ]);
  });

  it('renders a link per heading, indented by relative depth', async () => {
    const { handle } = await mountEditor('## Alpha\n\n### Beta\n');
    const el = renderToc(handle.getView());
    const links = [...el.querySelectorAll('.omd-toc-link')].map((a) => a.textContent);
    expect(links).toEqual(['Alpha', 'Beta']);
    const items = el.querySelectorAll('.omd-toc-item');
    // Shallowest heading is H2, so it sits at 0 and the H3 is indented one level.
    expect((items[0] as HTMLElement).style.paddingLeft).toBe('0px');
    expect((items[1] as HTMLElement).style.paddingLeft).toBe('16px');
  });

  it('renders an empty state when the document has no headings', async () => {
    const { handle } = await mountEditor('just text\n');
    expect(renderToc(handle.getView()).querySelector('.omd-toc-empty')).toBeTruthy();
  });

  it('keeps its derived output out of the file', async () => {
    const md = '<!-- omd:toc {} -->\n\n# One\n\n## Two\n';
    const out = await roundTrip(md);
    expect(normalizeMarkdown(out)).toBe(normalizeMarkdown(md));
    expect(out).not.toContain('omd-toc'); // the rendering never reaches disk
  });
});

describe('per-block round-trip', () => {
  const cases: Array<[string, string]> = [
    // Callouts — native alerts (all five kinds).
    ['note', '> [!NOTE]\n> Body.\n'],
    ['tip', '> [!TIP]\n> Body.\n'],
    ['important', '> [!IMPORTANT]\n> Body.\n'],
    ['warning', '> [!WARNING]\n> Body.\n'],
    ['caution', '> [!CAUTION]\n> Body.\n'],
    // Callout in its managed (parameterized) form.
    [
      'note (managed)',
      '<!-- omd:note {"title":"Heads up"} -->\n\nBody.\n\n<!-- /omd:note -->\n'
    ],
    // Structure.
    [
      'collapsible',
      '<!-- omd:collapsible {"summary":"Details"} -->\n\nBody **markdown**.\n\n<!-- /omd:collapsible -->\n'
    ],
    // Inline.
    ['date', '<!-- omd:date {"value":"2026-01-02"} -->\n'],
    ['toc', '<!-- omd:toc {} -->\n'],
    // Media — image with the GFM-visible alignment form.
    ['image (aligned)', '<div align="center">\n\n![Logo](logo.png)\n\n</div>\n'],
    // Rich — native GFM forms.
    ['mermaid', '```mermaid\ngraph TD\n  A --> B\n```\n'],
    ['math (block)', '$$\nx^2 + y^2 = z^2\n$$\n'],
    ['math (inline)', 'Mass–energy is $E = mc^2$ inline.\n']
  ];

  for (const [name, md] of cases) {
    it(`${name} round-trips byte-for-byte`, async () => {
      expect(normalizeMarkdown(await roundTrip(md))).toBe(normalizeMarkdown(md));
    });
  }
});
