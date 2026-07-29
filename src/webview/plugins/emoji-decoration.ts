import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { Node as ProseNode } from 'prosemirror-model';
import { emojiChar } from '../ui/emoji-data';

/**
 * Render a `:name:` emoji shortcode as its emoji glyph, while keeping the shortcode text on disk
 * (the GitHub-source form — the emoji picker and the preview/export agree). Decoration-only, so the
 * document is never edited and the round-trip is untouched (the same discipline as the date chip).
 *
 * The glyph is drawn with CSS `::before content: attr(data-emoji)` and the raw `:name:` is collapsed
 * to zero width — except when the selection is *inside* the token, where the raw shortcode is shown
 * so it can be edited (reveal-on-cursor, like a markdown editor un-hiding syntax you're on).
 */

/** A `:name:` shortcode; `g` for scanning text, so callers reset `lastIndex`. */
const SHORTCODE = /:([a-z0-9_+-]+):/g;

/** True when a text node is inline code — its `:name:` is literal, not a shortcode. */
function isInlineCode(node: ProseNode): boolean {
  return node.marks.some((m) => m.type.name === 'inlineCode');
}

function buildDecorations(state: EditorState): DecorationSet {
  const { doc, selection } = state;
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text || isInlineCode(node)) return true;
    SHORTCODE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SHORTCODE.exec(node.text))) {
      const char = emojiChar(m[1]);
      if (!char) continue;
      const from = pos + m.index;
      const to = from + m[0].length;
      // Reveal the raw shortcode when the cursor/selection is strictly inside the token.
      if (selection.from < to && selection.to > from) continue;
      decos.push(Decoration.inline(from, to, { class: 'omd-emoji', 'data-emoji': char }));
    }
    return true;
  });
  return DecorationSet.create(doc, decos);
}

const key = new PluginKey('omd-emoji-decoration');

export const emojiDecorationPlugin = $prose(
  () =>
    new Plugin({
      key,
      props: {
        decorations(state) {
          return buildDecorations(state);
        }
      }
    })
);
