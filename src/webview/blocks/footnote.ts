import type { EditorView } from 'prosemirror-view';
import type { Node as ProseNode } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';

/**
 * The `footnote` built-in. Footnotes are native GFM (`[^1]` … `[^1]: note`), already parsed
 * into `footnote_reference` / `footnote_definition` nodes by the GFM preset — so this block
 * adds no format of its own, only the affordance to create a correctly-numbered pair and put
 * the cursor where the note gets written.
 */

/** The next unused numeric label, so a new footnote never collides with an existing one. */
export function nextFootnoteLabel(doc: ProseNode): string {
  let max = 0;
  doc.descendants((node) => {
    if (node.type.name === 'footnote_definition') {
      const n = Number(node.attrs.label);
      if (Number.isInteger(n) && n > max) max = n;
    }
    return true;
  });
  return String(max + 1);
}

/** Insert a reference at the cursor plus its definition at the end, then focus the note. */
export function insertFootnote(view: EditorView): boolean {
  const { state } = view;
  const { footnote_reference, footnote_definition, paragraph } = state.schema.nodes;
  if (!footnote_reference || !footnote_definition) return false;

  const label = nextFootnoteLabel(state.doc);
  const { from, to } = state.selection;
  let tr = state.tr.replaceWith(from, to, footnote_reference.create({ label }));

  // The definition lives at the end of the document, the way a hand-writer files it.
  const definition = footnote_definition.create({ label }, paragraph.create());
  const at = tr.doc.content.size;
  tr = tr.insert(at, definition);
  tr = tr.setSelection(TextSelection.near(tr.doc.resolve(at + 2)));

  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}
