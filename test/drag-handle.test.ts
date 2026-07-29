import { describe, it, expect } from 'vitest';
import type { Node as ProseNode } from 'prosemirror-model';
import { mountEditor } from './helpers/editor';
import { moveBlock } from '../src/webview/plugins/drag-handle';
import { normalizeMarkdown } from '../src/shared/roundtrip';

/**
 * Phase 5: drag-to-reorder. The pointer interaction needs a layout engine jsdom lacks, but
 * the reorder itself is the pure `moveBlock` transaction — lift a top-level block and drop
 * it at a boundary — and that must round-trip to plain markdown (Principle 2).
 */

/** Top-level block ranges, in document order. */
function blocks(doc: ProseNode): Array<{ from: number; to: number; text: string }> {
  const out: Array<{ from: number; to: number; text: string }> = [];
  doc.forEach((node, offset) => out.push({ from: offset, to: offset + node.nodeSize, text: node.textContent }));
  return out;
}

async function withDoc(markdown: string) {
  const { handle } = await mountEditor(markdown);
  return { handle, view: handle.getView() };
}

describe('moveBlock', () => {
  it('moves the first block to the end', async () => {
    const { handle, view } = await withDoc('A\n\nB\n\nC\n');
    const b = blocks(view.state.doc);
    const tr = moveBlock(view.state, b[0].from, b[0].to, b[2].to)!;
    view.dispatch(tr);
    expect(normalizeMarkdown(handle.getMarkdown())).toBe('B\n\nC\n\nA\n');
  });

  it('moves a later block up before an earlier one', async () => {
    const { handle, view } = await withDoc('A\n\nB\n\nC\n');
    const b = blocks(view.state.doc);
    // Move C to before A.
    const tr = moveBlock(view.state, b[2].from, b[2].to, b[0].from)!;
    view.dispatch(tr);
    expect(normalizeMarkdown(handle.getMarkdown())).toBe('C\n\nA\n\nB\n');
  });

  it('is a no-op when dropped onto itself', async () => {
    const { view } = await withDoc('A\n\nB\n');
    const b = blocks(view.state.doc);
    // Any target within the block's own range must not move it.
    expect(moveBlock(view.state, b[0].from, b[0].to, b[0].from + 1)).toBeNull();
  });

  it('keeps a multi-line block intact when moved', async () => {
    const { handle, view } = await withDoc('- one\n- two\n\npara\n');
    const b = blocks(view.state.doc);
    // Move the list (block 0) below the paragraph (block 1).
    const tr = moveBlock(view.state, b[0].from, b[0].to, b[1].to)!;
    view.dispatch(tr);
    const out = normalizeMarkdown(handle.getMarkdown());
    expect(out.indexOf('para')).toBeLessThan(out.indexOf('- one'));
  });
});
