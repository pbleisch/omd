import { describe, it, expect } from 'vitest';
import { withSummaryText } from '../src/webview/plugins/collapsible/view';

/**
 * Inline rename of a collapsible's summary writes the new text back into the raw
 * `<summary>…</summary>` bytes (not just the attr), HTML-escaped, so the round-trip stays
 * byte-stable. (The full double-click flow is verified in the browser harness.)
 */

describe('withSummaryText', () => {
  it('replaces the summary content and escapes HTML', () => {
    expect(withSummaryText('<details><summary>Old</summary>', 'New & <x>')).toBe(
      '<details><summary>New &amp; &lt;x&gt;</summary>'
    );
  });

  it('preserves the details/summary tags and their attributes', () => {
    expect(withSummaryText('<details open><summary class="s">A</summary>', 'B')).toBe(
      '<details open><summary class="s">B</summary>'
    );
  });

  it('leaves a raw opener without a summary tag untouched', () => {
    expect(withSummaryText('<details>', 'B')).toBe('<details>');
  });
});
