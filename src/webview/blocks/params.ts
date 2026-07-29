import type { EditorView } from 'prosemirror-view';
import { buildOpen, stringifyParams } from '../../shared/shortcode';

/**
 * Write a smart block's params back to its schema node (Phase 2). This is the one path the
 * property panel commits through, for both leaves and containers. Editing params is a real
 * user edit — like promotion, the one moment OMD rewrites machinery — so it re-canonicalises
 * the delimiter bytes (`openRaw`/`raw`) from the new params rather than trying to preserve
 * the old string; only the params the user changed move.
 */
export function updateBlockParams(
  view: EditorView,
  pos: number,
  params: Record<string, unknown>
): boolean {
  const { state } = view;
  const node = state.doc.nodeAt(pos);
  if (!node) return false;
  const name = node.attrs.name as string;
  const p = stringifyParams(params);

  let attrs: Record<string, unknown>;
  if (node.type.name === 'shortcode_container') {
    attrs = { ...node.attrs, params: p, openRaw: buildOpen(name, p) };
  } else if (node.type.name === 'shortcode_leaf') {
    attrs = { ...node.attrs, params: p, raw: buildOpen(name, p) };
  } else {
    return false;
  }

  view.dispatch(state.tr.setNodeMarkup(pos, undefined, attrs));
  view.focus();
  return true;
}
