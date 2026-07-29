import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { Node as ProseNode } from 'prosemirror-model';
import { ensureHighlighter, getHighlighter, resolveLang, currentTheme } from '../highlight/shiki';

/**
 * Shiki syntax highlighting for code fences (Principle 1: an unhighlighted code fence
 * betrays "shown rendered"). We overlay inline decorations rather than replacing the
 * node, so the code stays fully editable. Highlighting arrives asynchronously — until
 * the highlighter loads, code shows plain; when it's ready, `view()` kicks a re-render.
 */
const key = new PluginKey('omd-code-highlight');

function decorateBlock(code: string, lang: string, base: number, out: Decoration[]): void {
  const highlighter = getHighlighter();
  if (!highlighter) return;
  let lines;
  try {
    lines = highlighter.codeToTokensBase(code, {
      lang: lang as never,
      theme: currentTheme() as never
    });
  } catch {
    return; // grammar not loaded — leave plain
  }
  // Map each token to a doc range. `offset` counts every char in `code`, newlines
  // included, so doc position is base + offset (base is the pos of the first code char).
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    for (const token of lines[i]) {
      const from = base + offset;
      const to = from + token.content.length;
      if (token.content.length > 0 && token.color) {
        out.push(Decoration.inline(from, to, { style: `color: ${token.color}` }));
      }
      offset += token.content.length;
    }
    offset += 1; // the newline that joins this line to the next
  }
}

function buildDecorations(doc: ProseNode): DecorationSet {
  if (!getHighlighter()) return DecorationSet.empty;
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'code_block') return;
    const lang = resolveLang(node.attrs.language);
    if (!lang) return;
    decorateBlock(node.textContent, lang, pos + 1, decos);
  });
  return DecorationSet.create(doc, decos);
}

export const codeHighlightPlugin = $prose(
  () =>
    new Plugin({
      key,
      view(view) {
        // Load the highlighter, then force a re-decoration once grammars are ready.
        void ensureHighlighter().then(() => {
          view.dispatch(view.state.tr.setMeta(key, 'ready'));
        });
        return {};
      },
      props: {
        decorations(state) {
          return buildDecorations(state.doc);
        }
      }
    })
);
