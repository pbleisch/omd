import { describe, it, expect } from 'vitest';
import { mountEditor } from './helpers/editor';
import { setBlocks } from '../src/webview/blocks/registry';
import { SHIPPED_BLOCKS } from '../src/shared/blocks';
import { renderToc } from '../src/webview/blocks/toc';

describe('toc params', () => {
  it('caps depth with maxLevel and numbers with ordered', async () => {
    setBlocks(SHIPPED_BLOCKS);
    const { handle } = await mountEditor('# A\n\n## B\n\n### C\n');
    const view = handle.getView();
    const limited = renderToc(view, { maxLevel: '2' });
    expect(limited.querySelectorAll('.omd-toc-item').length).toBe(2); // A, B — not C
    // Ordered prepends hierarchical section numbers; plain has none.
    const numbers = [...renderToc(view, { ordered: true }).querySelectorAll('.omd-toc-number')].map((n) => n.textContent);
    expect(numbers).toEqual(['1. ', '1.1. ', '1.1.1. ']);
    expect(renderToc(view, {}).querySelector('.omd-toc-number')).toBeNull();
  });
});

describe('gallery columns param', () => {
  it('sets data-columns on the block for a fixed count', async () => {
    setBlocks(SHIPPED_BLOCKS);
    const md = '<!-- omd:gallery {"columns":"3"} -->\n\n![a](a.png)\n\n<!-- /omd:gallery -->\n';
    const { root } = await mountEditor(md);
    const gallery = root.querySelector('.omd-block--gallery') as HTMLElement;
    expect(gallery?.dataset.columns).toBe('3');
  });
});
