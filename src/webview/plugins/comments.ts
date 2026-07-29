import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { Node as ProseNode } from 'prosemirror-model';
import { matchAnchor } from '../../shared/threads';
import { setActiveThread, onActiveThreadChange, getActiveThread } from '../blocks/active-thread';

/**
 * Comment anchors in the editor. The `<!-- omd-start:t1 -->…<!-- omd-end:t1 -->` pair is
 * machinery: hidden while writing (and invisible on GitHub, since it's an HTML comment) but
 * preserved byte-for-byte on save. Decoration-only — the document is never edited here, so
 * the round-trip is untouched and a thread stays bound to its *region* rather than to a copy
 * of the text (docs/design/FORMATS.md).
 */

export interface CommentRange {
  id: string;
  from: number;
  to: number;
}

/** Find every anchored region in the document, pairing start/end anchors by thread id. */
export function findCommentRanges(doc: ProseNode): CommentRange[] {
  const open = new Map<string, number>();
  const ranges: CommentRange[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'html') return true;
    const anchor = matchAnchor(String(node.attrs.value ?? ''));
    if (!anchor) return true;
    if (anchor.kind === 'start') {
      // The commented text begins after the anchor node itself.
      open.set(anchor.id, pos + node.nodeSize);
    } else {
      const from = open.get(anchor.id);
      if (from !== undefined) {
        ranges.push({ id: anchor.id, from, to: pos });
        open.delete(anchor.id);
      }
    }
    return true;
  });
  return ranges;
}

function buildDecorations(doc: ProseNode, activeId: string | null): DecorationSet {
  const decos: Decoration[] = [];

  // Hide the anchor comments themselves.
  doc.descendants((node, pos) => {
    if (node.type.name !== 'html') return true;
    if (matchAnchor(String(node.attrs.value ?? ''))) {
      decos.push(Decoration.inline(pos, pos + node.nodeSize, { class: 'omd-comment-anchor' }));
    }
    return true;
  });

  // Highlight the region each thread refers to; the active one gets a stronger highlight.
  for (const range of findCommentRanges(doc)) {
    if (range.to > range.from) {
      const active = range.id === activeId ? ' omd-comment-highlight--active' : '';
      decos.push(
        Decoration.inline(range.from, range.to, {
          class: `omd-comment-highlight${active}`,
          'data-thread': range.id
        })
      );
    }
  }
  return DecorationSet.create(doc, decos);
}

interface CommentsState {
  active: string | null;
}

const key = new PluginKey<CommentsState>('omd-comments');

export const commentsPlugin = $prose(
  () =>
    new Plugin<CommentsState>({
      key,
      state: {
        init: () => ({ active: getActiveThread() }),
        apply(tr, prev) {
          const meta = tr.getMeta(key) as CommentsState | undefined;
          return meta ?? prev;
        }
      },
      props: {
        decorations(state) {
          return buildDecorations(state.doc, key.getState(state)?.active ?? null);
        },
        // Clicking a commented span reveals its thread in the panel (doc → thread). Deferred so
        // it runs after ProseMirror places the cursor, and returns false so the click is normal.
        handleClick(view, pos) {
          const range = findCommentRanges(view.state.doc).find((r) => pos >= r.from && pos <= r.to);
          const id = range ? range.id : null;
          setTimeout(() => setActiveThread(id), 0);
          return false;
        }
      },
      view: (view) => {
        // Reflect active-thread changes (from either direction) in the region highlight.
        const off = onActiveThreadChange((id) => {
          if ((key.getState(view.state)?.active ?? null) !== id) {
            view.dispatch(view.state.tr.setMeta(key, { active: id }));
          }
        });
        return { destroy: off };
      }
    })
);
