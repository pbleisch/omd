import { describe, it, expect } from 'vitest';
import { mountEditor, roundTrip } from './helpers/editor';
import { roundTripEqual } from '../src/shared/roundtrip';

/**
 * GitHub alerts render as callouts (Principle 1: anything with a rendered form is shown
 * rendered) without a shortcode, and still round-trip (Principle 2).
 */
describe('callouts', () => {
  const kinds = [
    ['NOTE', 'Note'],
    ['TIP', 'Tip'],
    ['IMPORTANT', 'Important'],
    ['WARNING', 'Warning'],
    ['CAUTION', 'Caution']
  ] as const;

  for (const [marker, label] of kinds) {
    it(`renders [!${marker}] as a titled callout`, async () => {
      const md = `> [!${marker}]\n> Body text.\n`;
      const { root } = await mountEditor(md);
      const callout = root.querySelector('.omd-callout');
      expect(callout, 'callout element present').not.toBeNull();
      const title = root.querySelector('.omd-callout-title');
      expect(title?.textContent).toContain(label);
      // The raw marker is hidden machinery, not shown as text.
      expect(root.querySelector('.omd-callout-marker')).not.toBeNull();
    });

    it(`[!${marker}] round-trips`, async () => {
      const md = `> [!${marker}]\n> Body text.\n`;
      expect(roundTripEqual(await roundTrip(md), md)).toBe(true);
    });
  }

  it('leaves a plain blockquote untouched', async () => {
    const { root } = await mountEditor('> just a quote\n');
    expect(root.querySelector('.omd-callout')).toBeNull();
  });
});
