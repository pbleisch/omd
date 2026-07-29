import { describe, it, expect, beforeEach, vi } from 'vitest';
import { openFloating } from '../src/webview/ui/floating';

/**
 * Phase 0 foundation: the one floating-layer primitive behind the popover and context
 * menu. These pin the lifecycle contract — mounts a positioned layer, dismisses on
 * outside-click and Escape, and never fires `onDismiss` on a programmatic close — since
 * every over-editor surface now depends on it behaving identically.
 */

function content(): HTMLElement {
  const el = document.createElement('div');
  el.textContent = 'body';
  return el;
}

describe('floating layer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('mounts a fixed, positioned container holding the content', () => {
    const h = openFloating({ anchor: { left: 10, top: 20, bottom: 40 }, content: content() });
    expect(document.body.contains(h.el)).toBe(true);
    expect(h.el.style.position).toBe('fixed');
    expect(h.el.style.left).toBe('10px');
    // Below-placement puts the top at the anchor's bottom (offset defaults to 4).
    expect(h.el.style.top).toBe('44px');
    h.close();
    expect(document.body.contains(h.el)).toBe(false);
  });

  it('dismisses on outside mousedown and fires onDismiss once', async () => {
    const onDismiss = vi.fn();
    const h = openFloating({ anchor: { left: 0, top: 0, bottom: 0 }, content: content(), onDismiss });
    // Listeners attach on the next tick so the opening click can't self-dismiss.
    await new Promise((r) => setTimeout(r, 0));

    // A click inside the layer keeps it open.
    h.el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(document.body.contains(h.el)).toBe(true);

    // A click elsewhere dismisses it.
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(document.body.contains(h.el)).toBe(false);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('dismisses on Escape', async () => {
    const onDismiss = vi.fn();
    const h = openFloating({ anchor: { left: 0, top: 0, bottom: 0 }, content: content(), onDismiss });
    await new Promise((r) => setTimeout(r, 0));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.body.contains(h.el)).toBe(false);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not fire onDismiss on a programmatic close', async () => {
    const onDismiss = vi.fn();
    const h = openFloating({ anchor: { left: 0, top: 0, bottom: 0 }, content: content(), onDismiss });
    await new Promise((r) => setTimeout(r, 0));
    h.close();
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
