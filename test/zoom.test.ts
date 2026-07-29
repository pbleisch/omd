import { describe, it, expect, beforeEach } from 'vitest';
import { getZoom, setZoom, zoomIn, zoomOut, resetZoom, onZoomChange } from '../src/webview/ui/zoom';

/**
 * Phase 6: document zoom. A small pure state module — clamped, stepped, and it drives the
 * `--omd-zoom` custom property the writing surface scales by.
 */

describe('zoom', () => {
  beforeEach(() => resetZoom());

  it('steps in and out by 10 and reflects on the root variable', () => {
    zoomIn();
    expect(getZoom()).toBe(110);
    expect(document.documentElement.style.getPropertyValue('--omd-zoom')).toBe('1.1');
    zoomOut();
    zoomOut();
    expect(getZoom()).toBe(90);
  });

  it('clamps to the 50–200 range', () => {
    setZoom(1000);
    expect(getZoom()).toBe(200);
    setZoom(0);
    expect(getZoom()).toBe(50);
  });

  it('snaps arbitrary values to the nearest step', () => {
    setZoom(133);
    expect(getZoom()).toBe(130);
  });

  it('notifies subscribers immediately and on change', () => {
    const seen: number[] = [];
    const off = onZoomChange((z) => seen.push(z));
    expect(seen).toEqual([100]); // fires once on subscribe
    zoomIn();
    expect(seen).toEqual([100, 110]);
    off();
    zoomIn();
    expect(seen).toEqual([100, 110]); // no longer notified
  });
});
