import { describe, it, expect } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { mountEditor } from './helpers/editor';
import { createOmdEditor } from '../src/webview/editor';

/**
 * Guard for bug #7: the undo flash.
 *
 * The host legitimately pushes a document the editor does not already hold — VS Code's own
 * undo of the underlying `TextDocument` (which runs its own history in parallel with
 * ProseMirror's), an edit from another editor, or bytes remark re-serializes differently
 * (#11). `setMarkdown` used to answer every one of those with `replaceAll`, a full re-parse
 * and re-render of the document: every block's DOM node was thrown away and rebuilt, and the
 * selection went with it. On screen that reads as the content being pasted back into place.
 *
 * The push still has to be applied. It just has to be applied as the narrowest edit that
 * reaches it, so untouched blocks keep their DOM nodes (and their node views: diagrams,
 * charts, callouts) and the cursor stays where the writer left it.
 */

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const DOC = '# Hello\n\n> [!NOTE]\n> - x\n\nSome paragraph text here.\n';

describe('a host push updates only what changed (#7)', () => {
  it('leaves untouched blocks — and the selection — alone', async () => {
    const { root, handle } = await mountEditor(DOC);
    const view = handle.getView();
    await wait(60); // let the decoration plugins settle before we fingerprint the DOM

    const before = Array.from(view.dom.children);
    expect(before.length).toBeGreaterThanOrEqual(3); // heading, callout, paragraph

    // Cursor inside the heading, well away from the block that is about to change.
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 3)));
    const anchor = view.state.selection.anchor;

    // The host pushes a document that differs only in the final paragraph.
    handle.setMarkdown('# Hello\n\n> [!NOTE]\n> - x\n\nSome paragraph text here, and more.\n');

    const after = Array.from(view.dom.children);
    // Same DOM elements, not rebuilt copies — this is what `replaceAll` used to destroy.
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
    // The change itself landed.
    expect(handle.getMarkdown()).toContain('Some paragraph text here, and more.');
    // And the writer's cursor never moved.
    expect(view.state.selection.anchor).toBe(anchor);

    root.remove();
  });

  it('does nothing at all when the push only differs by remark normalization (#11)', async () => {
    // The editor serializes `> [!NOTE]\n> - x` back as `> [!NOTE]\n>\n> - x`, so the host's
    // bytes and the editor's never match for this construct and the serialization guard is
    // guaranteed to miss. That used to mean a full repaint on *every* sync, not just on undo.
    const { root, handle } = await mountEditor(DOC);
    const view = handle.getView();
    await wait(60);
    expect(handle.getMarkdown()).not.toBe(DOC); // the divergence is real

    const before = Array.from(view.dom.children);
    const doc = view.state.doc;

    handle.setMarkdown(DOC); // the host pushing the file's own bytes back

    expect(Array.from(view.dom.children)).toEqual(before);
    expect(view.state.doc).toBe(doc); // no transaction was dispatched at all

    root.remove();
  });

  it('still applies a wholesale change correctly', async () => {
    const { root, handle } = await mountEditor(DOC);

    handle.setMarkdown('## Different\n\n1. one\n2. two\n');
    expect(handle.getMarkdown()).toBe('## Different\n\n1. one\n2. two\n');

    root.remove();
  });

  it('applies an inserted block without rebuilding its neighbours', async () => {
    const { root, handle } = await mountEditor(DOC);
    const view = handle.getView();
    await wait(60);
    const firstBefore = view.dom.children[0];

    handle.setMarkdown('# Hello\n\nBrand new.\n\n> [!NOTE]\n> - x\n\nSome paragraph text here.\n');

    expect(view.dom.children[0]).toBe(firstBefore);
    expect(handle.getMarkdown()).toContain('Brand new.');

    root.remove();
  });
});

describe('the contracts the flash fix must not weaken', () => {
  it('a diff-applied load is still never echoed back as a user edit (#14)', async () => {
    // The echo guard exists so an external revert does not re-dirty the buffer. The load now
    // reaches the document through a narrow diff rather than `replaceAll`, and that
    // transaction fires `markdownUpdated` just the same — it must still be recognised as a
    // load and swallowed.
    const root = document.createElement('div');
    document.body.appendChild(root);
    const edits: string[] = [];
    const handle = await createOmdEditor({
      root,
      initial: 'hi\n',
      onEdit: (md) => edits.push(md)
    });

    handle.setMarkdown('# One\n\nalpha\n');
    await wait(350); // past the 200ms markdownUpdated debounce
    handle.setMarkdown('# One\n\nbeta\n'); // an external revert of that paragraph
    await wait(350);

    expect(edits).toEqual([]);

    // A real edit must still reach onEdit.
    handle.getView().dispatch(handle.getView().state.tr.insertText('!', 1));
    await wait(350);
    expect(edits.length).toBe(1);

    root.remove();
  });

  it('a no-op load still dispatches nothing, so undo steps stay separate', async () => {
    // Intermediate loads must not chain two user edits into one undo step by resetting
    // ProseMirror's history timer. The serialization skip is what prevents that, and it runs
    // before the diff — a load that serializes to what we already hold must not dispatch.
    const { root, handle } = await mountEditor('hello\n');
    const view = handle.getView();
    const doc = view.state.doc;

    handle.setMarkdown('hello\n');
    expect(view.state.doc).toBe(doc); // no transaction

    // Same when the bytes differ only in ways the serializer normalizes away.
    handle.setMarkdown('hello   \n');
    expect(view.state.doc).toBe(doc);

    root.remove();
  });

  it('edits separated by a pause still undo independently through a load', async () => {
    const { root, handle } = await mountEditor('hello\n');
    const view = handle.getView();

    view.dispatch(view.state.tr.insertText(' one', 6));
    await wait(400);
    handle.setMarkdown('hello one\n'); // the host echoing that edit back: a no-op load
    await wait(400);
    view.dispatch(view.state.tr.insertText(' two', 10));
    await wait(400);

    const { undo } = await import('prosemirror-history');
    undo(view.getState?.() ?? view.state, view.dispatch);
    expect(handle.getMarkdown()).toBe('hello one\n'); // only the second edit came off

    root.remove();
  });
});
