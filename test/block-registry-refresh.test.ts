import { describe, it, expect } from 'vitest';
import { mountEditor } from './helpers/editor';
import { setBlocks } from '../src/webview/blocks/registry';
import { SHIPPED_BLOCKS } from '../src/shared/blocks';

/**
 * A discovered (non-shipped) block's definition arrives after the document renders (async
 * discovery). Its chrome must refresh from the "unknown block" fallback (symbol-namespace icon,
 * name-as-title) to the real icon/title when the `blocks` message lands — otherwise it renders
 * a permanent `{}`.
 */

describe('block chrome refreshes when a discovered definition arrives', () => {
  it('updates a generic container header from fallback to the real icon/title', async () => {
    setBlocks([...SHIPPED_BLOCKS]); // no "mycustom" yet
    const { root } = await mountEditor('<!-- omd:mycustom {} -->\n\nbody\n\n<!-- /omd:mycustom -->\n');
    const name = () => root.querySelector('.omd-block--mycustom .omd-block-name')!;

    expect(name().querySelector('.codicon')!.className).toContain('symbol-namespace'); // {}
    expect(name().textContent).toContain('mycustom');

    setBlocks([
      ...SHIPPED_BLOCKS,
      { name: 'mycustom', title: 'My Custom', kind: 'container', icon: 'table', group: 'Custom', keywords: [], defaultParams: {}, trust: 'template', source: 'workspace' }
    ]);

    expect(name().querySelector('.codicon')!.className).toContain('codicon-table');
    expect(name().textContent).toContain('My Custom');

    setBlocks([...SHIPPED_BLOCKS]); // restore for other tests
  });
});
