import { describe, it, expect, afterEach } from 'vitest';
import { openParamPanel, closeParamPanel } from '../src/webview/ui/param-panel';

/**
 * The panel can be sized to match the block it edits, but a narrow block (a 240px image, a
 * broken-image box) must not squeeze the header and field rows below a usable width. It floats
 * freely, so it aligns with wide blocks and holds a floor for narrow ones.
 */
const anchor = { left: 100, top: 100, bottom: 120 };

describe('param panel width floor', () => {
  afterEach(() => closeParamPanel());

  it('never sizes below the minimum when matched to a small block', () => {
    openParamPanel({ title: 'Image', fields: [], anchor, width: 120, autoApply: true, onApply: () => {} });
    const panel = document.querySelector('.omd-param-panel') as HTMLElement;
    expect(parseInt(panel.style.width, 10)).toBeGreaterThanOrEqual(300);
  });

  it('matches the block width when the block is wide enough', () => {
    openParamPanel({ title: 'Table', fields: [], anchor, width: 520, autoApply: true, onApply: () => {} });
    const panel = document.querySelector('.omd-param-panel') as HTMLElement;
    expect(panel.style.width).toBe('520px');
  });

  it('leaves width to CSS when no block width is given', () => {
    openParamPanel({ title: 'Chart', fields: [], anchor, autoApply: true, onApply: () => {} });
    const panel = document.querySelector('.omd-param-panel') as HTMLElement;
    expect(panel.style.width).toBe('');
  });
});
