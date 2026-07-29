import { describe, it, expect } from 'vitest';
import { codicon, registerIcon } from '../src/webview/codicons';
import { registerBrandIcons } from '../src/webview/blocks/brand-icons';

/** The icon factory: codicon glyphs by default, a registered inline-SVG custom icon when present. */

describe('codicon', () => {
  it('returns an <i> codicon glyph for a normal name', () => {
    const el = codicon('bold');
    expect(el.tagName).toBe('I');
    expect(el.classList.contains('codicon-bold')).toBe(true);
  });

  it('returns an inline-SVG <span> for a registered custom icon', () => {
    registerIcon('test-logo', '<svg viewBox="0 0 1 1"><rect width="1" height="1"/></svg>');
    const el = codicon('test-logo');
    expect(el.tagName).toBe('SPAN');
    expect(el.classList.contains('codicon-custom')).toBe(true);
    expect(el.innerHTML).toContain('<svg');
  });

  it('registers monochrome brand icons (e.g. youtube) resolvable by name', () => {
    registerBrandIcons();
    const el = codicon('youtube');
    expect(el.tagName).toBe('SPAN');
    expect(el.querySelector('svg')).toBeTruthy();
    expect(el.innerHTML).toContain('fill="currentColor"'); // monochrome, theme-aware
  });
});
