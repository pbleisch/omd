import { describe, it, expect } from 'vitest';
import { dropTargetIndex } from '../src/webview/plugins/table-controls';

/**
 * Drop math for dragging a row/column onto a boundary. Boundaries are indexed 0..n (the line
 * before each line, plus one past the end); dropping past your own position shifts the target
 * left by one, and dropping onto either boundary that touches your own slot is a no-op.
 */
describe('table-controls dropTargetIndex', () => {
  it('dropping later shifts target down by one (boundary sits after removed line)', () => {
    // Column 0 dropped on boundary 3 (after col 2) lands at index 2.
    expect(dropTargetIndex(0, 3)).toBe(2);
    expect(dropTargetIndex(1, 4)).toBe(3);
  });

  it('dropping earlier lands at the boundary index', () => {
    expect(dropTargetIndex(3, 1)).toBe(1);
    expect(dropTargetIndex(2, 0)).toBe(0);
  });

  it('dropping onto either adjacent boundary is a no-op', () => {
    expect(dropTargetIndex(2, 2)).toBeNull(); // boundary before self
    expect(dropTargetIndex(2, 3)).toBeNull(); // boundary after self (3 -> 2 == self)
  });
});
