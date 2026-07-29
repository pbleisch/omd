import { describe, it, expect } from 'vitest';
import { createOmdEditor } from '../src/webview/editor';

/**
 * Guard for bug #14: a programmatic load (`setMarkdown`, e.g. the host pushing a document or
 * an external-change reload) must never be reported back as a user `onEdit`. Milkdown's
 * `markdownUpdated` is debounced 200ms and only fires once a previous doc exists — so the
 * *reload* (second load), not the first, is what used to bounce a non-byte-identical
 * re-serialization back and dirty the buffer. This test drives that exact sequence.
 */

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('load does not echo as a user edit (#14)', () => {
  it('neither the initial load nor a reload fires onEdit, even when re-serialization differs', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const edits: string[] = [];
    const handle = await createOmdEditor({
      root,
      initial: 'hi\n',
      onEdit: (md) => edits.push(md)
    });

    // Content whose canonical serialization tends to differ from the input (extra blank lines,
    // trailing spaces, a raw <br />) — the shape that dirtied real files.
    handle.setMarkdown('# One\n\n\n- a\n  - nested\n');
    await wait(350); // past the 200ms debounce
    handle.setMarkdown('# Two   \n\n\n- b\n  - deep\n\n  <br />\n'); // the reload
    await wait(350); // past the debounce again

    expect(edits).toEqual([]); // a load must never be reported as a user edit

    // A real edit, by contrast, must still reach onEdit.
    handle.getView().dispatch(handle.getView().state.tr.insertText('!', 1));
    await wait(350);
    expect(edits.length).toBe(1);

    root.remove();
  });
});
