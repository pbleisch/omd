import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import type { Node as ProseNode } from 'prosemirror-model';

/**
 * Escaped-markdown click-to-fix. When source contains backslash-escaped markup (`\*\*bold\*\*`)
 * or plain markdown is pasted as text, remark yields *literal* text ("**bold**") instead of
 * formatting. This plugin marks those literals with a dotted underline and, on click, converts
 * them to the real mark — a recovery affordance. Decoration + a targeted edit only; nothing scans
 * or rewrites the document on its own.
 *
 * Detection is deliberately conservative — doubled delimiters, backticks, and word-bounded single
 * emphasis — with guards so `2 * 3`, `my_var`, and `*.md` don't light up.
 */

interface EscMatch {
  from: number;
  to: number;
  mark: 'strong' | 'emphasis' | 'strike_through' | 'inlineCode';
  inner: string;
  label: string;
}

// Each: [regex over a text node, mark name, human label]. Order matters — doubled before single.
const PATTERNS: Array<[RegExp, EscMatch['mark'], string]> = [
  [/\*\*(\S(?:.*?\S)?)\*\*/g, 'strong', 'bold'],
  [/(?<!\w)__(\S(?:.*?\S)?)__(?!\w)/g, 'strong', 'bold'],
  [/~~(\S(?:.*?\S)?)~~/g, 'strike_through', 'strikethrough'],
  [/`([^`\n]+)`/g, 'inlineCode', 'code'],
  [/(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])/g, 'emphasis', 'italic'],
  [/(?<![\w_])_(?!\s)([^_\n]+?)(?<!\s)_(?![\w_])/g, 'emphasis', 'italic']
];

const key = new PluginKey<{ matches: EscMatch[] }>('omd-escaped-md');

export function findMatches(doc: ProseNode): EscMatch[] {
  const matches: EscMatch[] = [];
  doc.descendants((node, pos) => {
    // Don't touch code blocks (their content is meant to be literal).
    if (node.type.spec.code || node.type.name === 'code_block') return false;
    if (!node.isText || !node.text) return true;
    // Skip text that already carries a mark (e.g. inside inline code or a link).
    if (node.marks.length) return true;
    const text = node.text;
    for (const [re, mark, label] of PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const from = pos + m.index;
        const to = from + m[0].length;
        // Skip if this range overlaps one already found (e.g. `**x**` vs a stray single `*`).
        if (matches.some((x) => from < x.to && to > x.from)) continue;
        matches.push({ from, to, mark, inner: m[1], label });
      }
    }
    return true;
  });
  return matches;
}

function build(doc: ProseNode, matches: EscMatch[]): DecorationSet {
  return DecorationSet.create(
    doc,
    matches.map((m) =>
      Decoration.inline(m.from, m.to, {
        class: 'omd-escaped-md',
        title: `Click to format as ${m.label}`
      })
    )
  );
}

function convert(view: EditorView, m: EscMatch): void {
  const markType = view.state.schema.marks[m.mark];
  if (!markType) return;
  const text = view.state.schema.text(m.inner, [markType.create()]);
  view.dispatch(view.state.tr.replaceWith(m.from, m.to, text).scrollIntoView());
}

export const escapedMdPlugin = $prose(
  () =>
    new Plugin<{ matches: EscMatch[] }>({
      key,
      state: {
        init: (_c, state) => ({ matches: findMatches(state.doc) }),
        apply(tr, prev) {
          return tr.docChanged ? { matches: findMatches(tr.doc) } : prev;
        }
      },
      props: {
        decorations(state) {
          return build(state.doc, key.getState(state)?.matches ?? []);
        }
      },
      // The span is clearly styled (dotted underline, pointer), so a click on it fixes it. A
      // native mousedown listener (not ProseMirror's handleClick, which doesn't fire reliably on
      // an inline-decorated span) maps the click to a position and converts the matching literal.
      view: (view) => {
        const onDown = (event: MouseEvent) => {
          const target = event.target as HTMLElement | null;
          if (!target?.closest?.('.omd-escaped-md')) return;
          const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (!coords) return;
          const hit = (key.getState(view.state)?.matches ?? []).find(
            (m) => coords.pos >= m.from && coords.pos <= m.to
          );
          if (!hit) return;
          event.preventDefault();
          convert(view, hit);
        };
        view.dom.addEventListener('mousedown', onDown, true);
        return { destroy: () => view.dom.removeEventListener('mousedown', onDown, true) };
      }
    })
);
