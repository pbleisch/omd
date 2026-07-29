import { describe, it, expect } from 'vitest';
import { mountEditor } from './helpers/editor';
import { findMatches } from '../src/webview/plugins/escaped-md';

/**
 * Escaped-markdown detection. Backslash-escaped markup parses to *literal* text; the plugin marks
 * it for click-to-fix. Detection must be conservative — real prose like `2 * 3`, `my_var`, and
 * `*.md` must not light up. (Click conversion needs a layout engine and is verified in the
 * browser harness.)
 */

async function matches(md: string) {
  const { handle } = await mountEditor(md);
  return findMatches(handle.getView().state.doc);
}

describe('escaped-markdown detection', () => {
  it('detects escaped bold / strike / code / italic literals', async () => {
    expect((await matches('A \\*\\*bold\\*\\* word.\n')).map((m) => [m.label, m.inner])).toEqual([['bold', 'bold']]);
    expect((await matches('A \\~\\~gone\\~\\~ word.\n')).map((m) => m.label)).toEqual(['strikethrough']);
    expect((await matches('A \\`snippet\\` word.\n')).map((m) => m.label)).toEqual(['code']);
    expect((await matches('An \\*emphatic\\* word.\n')).map((m) => m.label)).toEqual(['italic']);
  });

  it('does NOT flag ordinary prose (2 * 3, my_var, *.md)', async () => {
    expect(await matches('Compute 2 * 3 = 6 here.\n')).toEqual([]);
    expect(await matches('The my_var and other_thing names.\n')).toEqual([]);
    expect(await matches('Match *.md and *.ts globs.\n')).toEqual([]);
  });

  it('applies the click affordance in the DOM', async () => {
    const { root } = await mountEditor('See \\*\\*this\\*\\* please.\n');
    const spans = root.querySelectorAll('.omd-escaped-md');
    expect(spans.length).toBe(1);
    expect(spans[0].textContent).toBe('**this**');
  });
});
