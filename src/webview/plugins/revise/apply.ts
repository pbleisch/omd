import type { EditorView } from 'prosemirror-view';
import { Slice } from 'prosemirror-model';
import { parseMarkdownDoc } from '../../blocks/md-bridge';

/**
 * Replace the range `[from, to]` with the model's revision, parsed from markdown. Mirrors
 * `applyAiResult` (blocks/ai.ts): the common case — a single-paragraph result — replaces the range
 * with that paragraph's **inline content**, so surrounding text and inline marks (`**bold**`, links)
 * survive; a multi-block result is fitted with `replaceRange`; a parse failure falls back to plain
 * text. The whole edit is one undoable transaction — the document was untouched until this point.
 */
export function applyRevision(view: EditorView, from: number, to: number, markdown: string): void {
  const text = markdown.trim();
  if (!text || to <= from) return;
  const schema = view.state.schema;
  const doc = parseMarkdownDoc(text);

  const build = () => {
    const tr = view.state.tr;
    if (doc && doc.childCount === 1 && doc.firstChild?.type.name === 'paragraph') {
      tr.replaceWith(from, to, doc.firstChild.content); // inline: keep the block, preserve marks
    } else if (doc && doc.content.size > 0) {
      tr.replaceRange(from, to, new Slice(doc.content, 0, 0)); // multi-block: let PM fit it
    } else {
      tr.replaceWith(from, to, schema.text(text));
    }
    return tr;
  };

  let tr;
  try {
    tr = build();
  } catch {
    // Any schema-fit error (e.g. an inline range against block content) → plain-text fallback.
    tr = view.state.tr.replaceWith(from, to, schema.text(text));
  }
  view.dispatch(tr.scrollIntoView());
  view.focus();
}
