import { describe, it, expect } from 'vitest';
import { mountEditor } from './helpers/editor';

/**
 * The code-block language picker. The header input shows the fence's language; editing it updates
 * the code_block node's language attr, which round-trips to the fence info string.
 */

describe('code block language picker', () => {
  it('shows the current language and changing it rewrites the fence', async () => {
    const { root, handle } = await mountEditor('```ts\nconst x = 1;\n```\n');
    const input = root.querySelector<HTMLInputElement>('.omd-codeblock-lang');
    expect(input).toBeTruthy();
    expect(input!.value).toBe('ts');

    input!.value = 'python';
    input!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(handle.getMarkdown()).toContain('```python');
  });

  it('clearing the language yields a bare fence', async () => {
    const { root, handle } = await mountEditor('```js\nx\n```\n');
    const input = root.querySelector<HTMLInputElement>('.omd-codeblock-lang');
    input!.value = '';
    input!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(handle.getMarkdown()).not.toContain('```js');
  });
});
