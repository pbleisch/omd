import { describe, it, expect } from 'vitest';
import {
  matchOpen,
  matchClose,
  isShortcode,
  buildOpen,
  buildClose,
  parseParams,
  stringifyParams
} from '../src/shared/shortcode';
import { pairShortcodes, type MdNode } from '../src/webview/plugins/shortcode/transform';
import { roundTrip, mountEditor } from './helpers/editor';
import { normalizeMarkdown } from '../src/shared/roundtrip';

/** Flatten the editor's document to the sequence of node type names it holds. */
async function docTypes(md: string): Promise<string[]> {
  const { handle } = await mountEditor(md);
  const types: string[] = [];
  handle.getView().state.doc.descendants((n) => {
    types.push(n.type.name);
    return true;
  });
  return types;
}

/**
 * P4 foundation: the shortcode contract host and editor share (docs/design/FORMATS.md). The unit
 * tests pin the byte grammar; the round-trip tests prove leaf and container shortcodes —
 * including a rich, nested body — survive open→save unchanged (Principle 2).
 */

describe('shortcode grammar', () => {
  it('matches a leaf / opener and captures raw params', () => {
    expect(matchOpen('<!-- omd:date {"value":"2026-01-02"} -->')).toEqual({
      name: 'date',
      params: '{"value":"2026-01-02"}'
    });
  });

  it('matches a close tag', () => {
    expect(matchClose('<!-- /omd:collapsible -->')).toEqual({ name: 'collapsible' });
  });

  it('captures nested braces in params (greedy to the last brace)', () => {
    expect(matchOpen('<!-- omd:chart {"data":{"a":1}} -->')?.params).toBe('{"data":{"a":1}}');
  });

  it('rejects non-shortcode comments and plain html', () => {
    expect(matchOpen('<!-- just a comment -->')).toBeNull();
    expect(matchClose('<!-- omd:date {} -->')).toBeNull();
    expect(isShortcode('<div>hi</div>')).toBe(false);
  });

  it('build/parse are inverse to the on-disk bytes', () => {
    expect(buildOpen('youtube', '{"url":"x"}')).toBe('<!-- omd:youtube {"url":"x"} -->');
    expect(buildClose('tabs')).toBe('<!-- /omd:tabs -->');
    expect(stringifyParams({ a: 1 })).toBe('{"a":1}');
    expect(parseParams('{"a":1}')).toEqual({ a: 1 });
    expect(parseParams('not json')).toEqual({});
  });
});

describe('shortcode pairing transform', () => {
  const html = (value: string): MdNode => ({ type: 'html', value });
  const para = (t: string): MdNode => ({ type: 'paragraph', children: [{ type: 'text', value: t }] });

  it('leaves an unclosed opener as a leaf', () => {
    const out = pairShortcodes([html('<!-- omd:date {"value":"x"} -->'), para('after')]);
    expect(out[0]).toMatchObject({ type: 'omdLeaf', name: 'date', params: '{"value":"x"}' });
    expect(out[1]).toMatchObject({ type: 'paragraph' });
  });

  it('wraps a body between matching open/close into a container', () => {
    const out = pairShortcodes([
      html('<!-- omd:collapsible {"summary":"s"} -->'),
      para('body'),
      html('<!-- /omd:collapsible -->')
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: 'omdContainer', name: 'collapsible' });
    expect((out[0].children as MdNode[])[0]).toMatchObject({ type: 'paragraph' });
  });

  it('pairs balanced same-name nesting by depth', () => {
    const out = pairShortcodes([
      html('<!-- omd:x {} -->'),
      html('<!-- omd:x {} -->'),
      para('inner'),
      html('<!-- /omd:x -->'),
      html('<!-- /omd:x -->')
    ]);
    expect(out).toHaveLength(1);
    const inner = out[0].children as MdNode[];
    expect(inner[0]).toMatchObject({ type: 'omdContainer', name: 'x' });
  });

  it('recognizes a delimiter wrapped in a paragraph (the real remark shape)', () => {
    const wrapped = (v: string): MdNode => ({
      type: 'paragraph',
      children: [{ type: 'html', value: v }]
    });
    const out = pairShortcodes([
      wrapped('<!-- omd:collapsible {} -->'),
      para('body'),
      wrapped('<!-- /omd:collapsible -->')
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: 'omdContainer', name: 'collapsible' });
  });
});

describe('shortcode schema nodes (rendered, not raw text)', () => {
  it('a leaf becomes a shortcode_leaf node', async () => {
    expect(await docTypes('<!-- omd:date {"value":"x"} -->\n')).toContain('shortcode_leaf');
  });

  it('a container becomes a shortcode_container wrapping its body', async () => {
    const types = await docTypes(
      '<!-- omd:collapsible {"summary":"s"} -->\n\nBody.\n\n<!-- /omd:collapsible -->\n'
    );
    expect(types[0]).toBe('shortcode_container');
    expect(types).toContain('paragraph'); // the body survived as real markdown
  });

  it('leaves a non-omd comment as plain html, not a shortcode node', async () => {
    const types = await docTypes('<!-- keep me -->\n');
    expect(types).not.toContain('shortcode_leaf');
    expect(types).not.toContain('shortcode_container');
  });
});

describe('shortcode round-trip', () => {
  const cases: Array<[string, string]> = [
    ['leaf', '<!-- omd:date {"value":"2026-01-02"} -->\n'],
    ['leaf with empty params', '<!-- omd:toc {} -->\n'],
    [
      'container with rich body',
      '<!-- omd:collapsible {"summary":"Details"} -->\n\nBody **markdown** here.\n\n- one\n- two\n\n<!-- /omd:collapsible -->\n'
    ],
    [
      'nested containers',
      '<!-- omd:tabs {} -->\n\n<!-- omd:collapsible {"summary":"x"} -->\n\nInner.\n\n<!-- /omd:collapsible -->\n\n<!-- /omd:tabs -->\n'
    ],
    [
      'leaf amid prose',
      'Before.\n\n<!-- omd:youtube {"url":"https://youtu.be/abc"} -->\n\nAfter.\n'
    ]
  ];
  for (const [name, md] of cases) {
    it(`${name} comes back byte-identical`, async () => {
      const out = await roundTrip(md);
      expect(normalizeMarkdown(out)).toBe(normalizeMarkdown(md));
    });
  }

  it('does not disturb a non-omd html comment', async () => {
    const md = '<!-- keep me -->\n\nText.\n';
    expect(normalizeMarkdown(await roundTrip(md))).toBe(normalizeMarkdown(md));
  });
});
