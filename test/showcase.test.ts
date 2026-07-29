import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { roundTrip } from './helpers/editor';
import { setBlocks } from '../src/webview/blocks/registry';
import { SHIPPED_BLOCKS } from '../src/shared/blocks';

/**
 * The showcase wiki (`showcase/`) is also a round-trip fixture: every authored page must come back
 * byte-for-byte through the editor. BUGS.md is excluded — it's a verbatim copy of the working
 * backlog, not authored to be canonical.
 */
const dir = resolve(__dirname, '../showcase');
const files = readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'BUGS.md');

describe('showcase pages round-trip byte-for-byte', () => {
  beforeAll(() => setBlocks(SHIPPED_BLOCKS));
  for (const f of files) {
    it(f, async () => {
      const src = readFileSync(resolve(dir, f), 'utf8');
      expect(await roundTrip(src)).toBe(src);
    });
  }
});
