import { describe, expect, it } from 'vitest';
import { undo } from 'prosemirror-history';
import { NodeSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { mergeAdjacentLists } from '../src/webview/plugins/list-adjacency';
import { mountEditor, roundTripDoc } from './helpers/editor';

/** Delete the top-level block separating two lists, through the live editor transaction path. */
function deleteTopLevelSeparator(view: EditorView): void {
  const first = view.state.doc.child(0);
  const separator = view.state.doc.child(1);
  const from = first.nodeSize;
  view.dispatch(view.state.tr.delete(from, from + separator.nodeSize));
}

async function expectReopensSame(view: EditorView, markdown: string): Promise<void> {
  const reopened = await roundTripDoc(markdown);
  expect(reopened.doc.toJSON()).toEqual(view.state.doc.toJSON());
}

describe('adjacent list merging (#22)', () => {
  it('merges ordered lists and continues their visible numbering', async () => {
    const input =
      '1. Build\n2. Test\n\nA note between the procedures.\n\n1. Deploy\n2. Verify\n';
    const { root, handle } = await mountEditor(input);
    const view = handle.getView();

    deleteTopLevelSeparator(view);

    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.doc.firstChild?.type.name).toBe('ordered_list');
    expect(handle.getMarkdown()).toBe('1. Build\n2. Test\n3. Deploy\n4. Verify\n');
    const labels = Array.from(
      { length: view.state.doc.firstChild?.childCount ?? 0 },
      (_, index) => view.state.doc.firstChild?.child(index).attrs.label
    );
    expect(labels).toEqual(['1.', '2.', '3.', '4.']);
    await expectReopensSame(view, handle.getMarkdown());
    root.remove();
  });

  it('merges unordered lists without changing their marker family', async () => {
    const input = '- a\n- b\n\nnote\n\n- c\n- d\n';
    const { root, handle } = await mountEditor(input);
    const view = handle.getView();

    deleteTopLevelSeparator(view);

    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.doc.firstChild?.type.name).toBe('bullet_list');
    expect(handle.getMarkdown()).toBe('- a\n- b\n- c\n- d\n');
    await expectReopensSame(view, handle.getMarkdown());
    root.remove();
  });

  it('coalesces a whole run when one transaction removes multiple separators', async () => {
    const input = '- a\n\nfirst\n\n- b\n\nsecond\n\n- c\n';
    const { root, handle } = await mountEditor(input);
    const view = handle.getView();
    const firstSeparatorFrom = view.state.doc.child(0).nodeSize;
    const firstSeparatorSize = view.state.doc.child(1).nodeSize;
    const secondSeparatorFrom =
      firstSeparatorFrom +
      firstSeparatorSize +
      view.state.doc.child(2).nodeSize;
    const secondSeparatorSize = view.state.doc.child(3).nodeSize;

    const tr = view.state.tr
      .delete(secondSeparatorFrom, secondSeparatorFrom + secondSeparatorSize)
      .delete(firstSeparatorFrom, firstSeparatorFrom + firstSeparatorSize);
    view.dispatch(tr);

    expect(view.state.doc.childCount).toBe(1);
    expect(handle.getMarkdown()).toBe('- a\n- b\n- c\n');
    await expectReopensSame(view, handle.getMarkdown());
    root.remove();
  });

  it('does not merge incompatible list types', async () => {
    const { root, handle } = await mountEditor('1. one\n2. two\n\nnote\n\n- three\n- four\n');
    const view = handle.getView();

    deleteTopLevelSeparator(view);

    expect(view.state.doc.childCount).toBe(2);
    expect(Array.from({ length: 2 }, (_, i) => view.state.doc.child(i).type.name)).toEqual([
      'ordered_list',
      'bullet_list'
    ]);
    expect(handle.getMarkdown()).toBe('1. one\n2. two\n\n- three\n- four\n');
    root.remove();
  });

  it('keeps each item subtree intact when the lists contain nested lists', async () => {
    const input = '- a\n  - a1\n  - a2\n\nseparator\n\n- b\n  - b1\n';
    const { root, handle } = await mountEditor(input);
    const view = handle.getView();

    deleteTopLevelSeparator(view);

    const list = view.state.doc.firstChild;
    expect(list?.childCount).toBe(2);
    expect(list?.child(0).lastChild?.type.name).toBe('bullet_list');
    expect(list?.child(1).lastChild?.type.name).toBe('bullet_list');
    expect(handle.getMarkdown()).toBe('- a\n  - a1\n  - a2\n- b\n  - b1\n');
    await expectReopensSame(view, handle.getMarkdown());
    root.remove();
  });

  it('merges lists inside a nested flow container', async () => {
    const input = '> - a\n>\n> separator\n>\n> - b\n';
    const { root, handle } = await mountEditor(input);
    const view = handle.getView();
    let separatorFrom = -1;
    let separatorSize = 0;
    view.state.doc.descendants((node, pos) => {
      if (separatorFrom < 0 && node.type.name === 'paragraph' && node.textContent === 'separator') {
        separatorFrom = pos;
        separatorSize = node.nodeSize;
      }
      return separatorFrom < 0;
    });

    view.dispatch(view.state.tr.delete(separatorFrom, separatorFrom + separatorSize));

    const quote = view.state.doc.firstChild;
    expect(quote?.childCount).toBe(1);
    expect(quote?.firstChild?.type.name).toBe('bullet_list');
    expect(handle.getMarkdown()).toBe('> - a\n> - b\n');
    root.remove();
  });

  it('leaves the caret at the junction rather than the end of the merged list', async () => {
    const input = '- a\n- b\n\nseparator\n\n- c\n- d\n';
    const { root, handle } = await mountEditor(input);
    const view = handle.getView();
    const from = view.state.doc.child(0).nodeSize;

    // The gesture #22 is about: select the paragraph between the two lists and delete it.
    view.dispatch(
      view.state.tr.setSelection(NodeSelection.create(view.state.doc, from)).deleteSelection()
    );

    expect(handle.getMarkdown()).toBe('- a\n- b\n- c\n- d\n');
    expect(view.state.selection.$head.parent.textContent).not.toBe('d');
    expect(['b', 'c']).toContain(view.state.selection.$head.parent.textContent);
    root.remove();
  });

  it('looks for adjacency only around the ranges the transactions touched', async () => {
    // Two lists that differ only by marker parse as two adjacent nodes with no edit at all.
    const { root, handle } = await mountEditor('- a\n* b\n');
    const { state } = handle.getView();
    expect(state.doc.childCount).toBe(2);

    expect(mergeAdjacentLists(state, [])).toBeNull();

    const junction = state.doc.child(0).nodeSize;
    const merged = mergeAdjacentLists(state, [[junction, junction]]);
    expect(merged).not.toBeNull();
    expect(merged?.doc.childCount).toBe(1);
    root.remove();
  });

  it('undoes the deletion and appended merge as one structural action', async () => {
    const input = '- a\n- b\n\nseparator\n\n- c\n- d\n';
    const { root, handle } = await mountEditor(input);
    const view = handle.getView();

    deleteTopLevelSeparator(view);
    expect(handle.getMarkdown()).toBe('- a\n- b\n- c\n- d\n');

    expect(undo(view.state, view.dispatch)).toBe(true);
    expect(handle.getMarkdown()).toBe(input);
    expect(view.state.doc.childCount).toBe(3);
    root.remove();
  });
});
