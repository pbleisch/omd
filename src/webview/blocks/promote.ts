import type { EditorView } from 'prosemirror-view';
import type { Node as ProseNode, Schema } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import { buildOpen, buildClose, stringifyParams, parseParams } from '../../shared/shortcode';
import { CALLOUT_KINDS, CALLOUT_MARKER } from './callout-kinds';

/**
 * Native ↔ managed promotion for callouts (docs/design/SMART-BLOCKS.md). Promotion is a real user
 * edit — the one moment OMD adds machinery — not a round-trip concern: it replaces a native
 * `> [!NOTE]` blockquote with an `omd:note` container carrying the params the bare alert
 * can't hold. Demotion is the exact inverse, so clearing a callout's customization removes
 * the machinery and leaves plain GFM again.
 *
 * The managed body is the callout's content with the `[!KIND]` marker stripped — OMD draws
 * the callout from the container's name, so the marker would be redundant (and would double-
 * render). Demotion re-adds it.
 */

/**
 * Strip a leading `[!KIND]` marker from a callout's first paragraph, preserving the rest of
 * its inline content *with marks* (a bold word in the body must survive promotion). Returns
 * null if the paragraph held only the marker.
 */
function stripMarker(schema: Schema, para: ProseNode): ProseNode | null {
  const m = CALLOUT_MARKER.exec(para.textContent);
  if (!m) return para;
  let frag = para.content.cut(m[0].length);
  // Trim a leading line break (the newline after the marker) or whitespace text node.
  const first = frag.firstChild;
  if (first && !first.isText && first.type.name.startsWith('hard')) {
    frag = frag.cut(first.nodeSize);
  } else if (first?.isText && first.text) {
    const trimmed = first.text.replace(/^\s+/, '');
    frag = trimmed
      ? frag.replaceChild(0, schema.text(trimmed, first.marks))
      : frag.cut(first.nodeSize);
  }
  if (frag.childCount === 0) return null;
  return schema.nodes.paragraph.create(para.attrs, frag);
}

/** Build the managed container node from a native callout blockquote. */
function nativeToManaged(
  schema: Schema,
  blockquote: ProseNode,
  kind: string,
  params: Record<string, unknown>
): ProseNode {
  const body: ProseNode[] = [];
  blockquote.forEach((child, _offset, i) => {
    if (i === 0 && child.type.name === 'paragraph') {
      const stripped = stripMarker(schema, child);
      if (stripped) body.push(stripped);
    } else {
      body.push(child);
    }
  });
  if (body.length === 0) body.push(schema.nodes.paragraph.create());
  const p = stringifyParams(params);
  return schema.nodes.shortcode_container.create(
    { name: kind, params: p, openRaw: buildOpen(kind, p), closeRaw: buildClose(kind) },
    body
  );
}

/**
 * Build the native callout blockquote from a managed callout container. The marker goes on
 * its own line (the GitHub-recognized alert form), and the body children are kept intact —
 * marks and all — beneath it.
 */
function managedToNative(schema: Schema, container: ProseNode, kind: string): ProseNode {
  const marker = `[!${kind.toUpperCase()}]`;
  const children: ProseNode[] = [schema.nodes.paragraph.create(null, schema.text(marker))];
  container.forEach((child) => children.push(child));
  return schema.nodes.blockquote.create(null, children);
}

/** Promote the native callout blockquote at `pos` to a managed `omd:<kind>` block. */
export function promoteCalloutToManaged(
  view: EditorView,
  pos: number,
  kind: string,
  params: Record<string, unknown>
): boolean {
  const { state } = view;
  const blockquote = state.doc.nodeAt(pos);
  if (!blockquote || blockquote.type.name !== 'blockquote' || !CALLOUT_KINDS[kind]) return false;
  // Only a blockquote that really is an alert of this kind may be promoted.
  const marker = CALLOUT_MARKER.exec(blockquote.child(0)?.textContent ?? '');
  if (!marker || marker[1].toLowerCase() !== kind) return false;
  const container = nativeToManaged(state.schema, blockquote, kind, params);
  const tr = state.tr.replaceWith(pos, pos + blockquote.nodeSize, container);
  tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)));
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

/** Demote the managed callout container at `pos` back to a native `> [!KIND]` blockquote. */
export function demoteManagedToNative(view: EditorView, pos: number): boolean {
  const { state } = view;
  const container = state.doc.nodeAt(pos);
  if (!container || container.type.name !== 'shortcode_container') return false;
  const kind = container.attrs.name as string;
  if (!CALLOUT_KINDS[kind]) return false;
  const blockquote = managedToNative(state.schema, container, kind);
  const tr = state.tr.replaceWith(pos, pos + container.nodeSize, blockquote);
  tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)));
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

/** Update a managed callout's params in place, or demote it when nothing remains to store. */
export function updateManagedCallout(
  view: EditorView,
  pos: number,
  params: Record<string, unknown>
): boolean {
  const cleaned = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v != null)
  );
  if (Object.keys(cleaned).length === 0) return demoteManagedToNative(view, pos);

  const { state } = view;
  const container = state.doc.nodeAt(pos);
  if (!container || container.type.name !== 'shortcode_container') return false;
  const kind = container.attrs.name as string;
  const p = stringifyParams(cleaned);
  const tr = state.tr.setNodeMarkup(pos, undefined, {
    ...container.attrs,
    params: p,
    openRaw: buildOpen(kind, p)
  });
  view.dispatch(tr);
  return true;
}

/** Read a managed callout's stored params. */
export function readManagedParams(node: ProseNode): Record<string, unknown> {
  return parseParams(node.attrs.params as string);
}
