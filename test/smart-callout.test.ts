import { describe, it, expect, beforeAll } from 'vitest';
import { roundTrip } from './helpers/editor';
import { setBlocks } from '../src/webview/blocks/registry';
import { SHIPPED_BLOCKS } from '../src/shared/blocks';

describe('smart callout round-trip', () => {
  beforeAll(() => setBlocks(SHIPPED_BLOCKS));
  it('shortcode + titled blockquote round-trips byte-for-byte', async () => {
    const md = [
      '<!-- omd:callout {"icon":"light-bulb","color":"#a371f7"} -->',
      '',
      '> **My title**',
      '>',
      '> Body text, real markdown.',
      '',
      '<!-- /omd:callout -->',
      ''
    ].join('\n');
    expect(await roundTrip(md)).toBe(md);
  });
});
