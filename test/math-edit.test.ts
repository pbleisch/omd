import { describe, it, expect } from 'vitest';
import { mountEditor } from './helpers/editor';

/**
 * Bug #21: clicking away from a math edit box must dismiss it. The commit used to rely on the
 * setNodeMarkup dispatch → update() → renderMath path, which is a no-op (so update never fires)
 * when the value is unchanged — leaving the input stuck open. commit now re-renders directly.
 */
describe('math edit box dismisses (#21)', () => {
  it('blurring the edit input with no change re-renders (removes the input)', async () => {
    const { root } = await mountEditor('The identity $E = mc^2$ holds.\n');
    const math = root.querySelector<HTMLElement>('.omd-math')!;
    expect(math).toBeTruthy();

    // Click to edit → an input appears.
    math.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const input = math.querySelector<HTMLInputElement>('.omd-math-edit')!;
    expect(input).toBeTruthy();

    // Blur without changing the value → the edit box must close (input removed).
    input.dispatchEvent(new Event('blur'));
    expect(math.querySelector('.omd-math-edit')).toBeNull();
  });
});
