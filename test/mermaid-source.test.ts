import { describe, it, expect } from 'vitest';
import { mountEditor, roundTrip } from './helpers/editor';

/**
 * Bug #2: the mermaid block's Source tab must be editable. It was broken because the whole
 * NodeView wrapper was `contentEditable=false`, so the source <code> (the contentDOM) inherited
 * non-editable — no cursor, no typing. Only the chrome (header, rendered preview) should opt
 * out; the source must live in an editable region.
 *
 * (Assertions use the `.contentEditable` property, not `getAttribute` — jsdom sets the property
 * but doesn't reflect it to the attribute.)
 */

const MERMAID = '```mermaid\ngraph TD\n  A --> B\n```\n';

/** True if `el` or any ancestor has been explicitly opted out of editing. */
function hasEditableFalseAncestor(el: HTMLElement | null): boolean {
  for (let cur = el; cur; cur = cur.parentElement) {
    if (cur.contentEditable === 'false') return true;
  }
  return false;
}

describe('mermaid Source editing (#2)', () => {
  it('keeps the source in an editable region — only chrome opts out', async () => {
    const { root } = await mountEditor(MERMAID);
    const block = root.querySelector<HTMLElement>('.omd-block--mermaid')!;
    expect(block).toBeTruthy();

    // The wrapper must NOT be contentEditable=false (that made the source impossible to type in).
    expect(block.contentEditable).not.toBe('false');
    // Chrome opts out.
    expect(block.querySelector<HTMLElement>('.omd-block-header')!.contentEditable).toBe('false');
    expect(block.querySelector<HTMLElement>('.omd-mermaid-preview')!.contentEditable).toBe('false');

    // The source <code> (the contentDOM) has no opted-out ancestor → it's editable.
    const code = block.querySelector<HTMLElement>('.omd-block-source code')!;
    expect(code).toBeTruthy();
    expect(hasEditableFalseAncestor(code)).toBe(false);
  });

  it('round-trips the mermaid fence unchanged', async () => {
    expect(await roundTrip(MERMAID)).toBe(MERMAID);
  });
});
