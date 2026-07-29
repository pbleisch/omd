import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import type { Node as ProseNode } from 'prosemirror-model';

/**
 * Heading folding — a ▶/▼ chevron on each heading that collapses the section beneath it (every
 * top-level block up to the next heading of equal-or-higher level). Purely editor-side and
 * decoration-based: fold state is ephemeral (a set of heading positions in plugin state, remapped
 * across edits), and hidden blocks are just `display:none` decorations — the document and the
 * round-trip are never touched.
 */

const key = new PluginKey<Set<number>>('omd-heading-fold');

interface Child {
  node: ProseNode;
  offset: number;
}

function topChildren(doc: ProseNode): Child[] {
  const out: Child[] = [];
  doc.forEach((node, offset) => out.push({ node, offset }));
  return out;
}

function chevron(view: EditorView, headingOffset: number, folded: boolean): HTMLElement {
  const el = document.createElement('span');
  el.className = 'omd-fold-chevron' + (folded ? ' omd-fold-chevron--folded' : '');
  el.textContent = folded ? '▸' : '▾';
  el.contentEditable = 'false';
  el.title = folded ? 'Expand section' : 'Collapse section';
  el.addEventListener('mousedown', (e) => {
    e.preventDefault();
    view.dispatch(view.state.tr.setMeta(key, { toggle: headingOffset }));
  });
  return el;
}

function build(doc: ProseNode, folded: Set<number>): DecorationSet {
  const decos: Decoration[] = [];
  const kids = topChildren(doc);
  for (let i = 0; i < kids.length; i++) {
    const { node, offset } = kids[i];
    if (node.type.name !== 'heading') continue;
    const level = node.attrs.level as number;
    const isFolded = folded.has(offset);
    decos.push(
      Decoration.widget(offset + 1, (v) => chevron(v, offset, isFolded), {
        side: -1,
        key: `fold-${offset}-${isFolded}`
      })
    );
    decos.push(
      Decoration.node(offset, offset + node.nodeSize, {
        class: isFolded ? 'omd-heading-folded' : 'omd-heading-foldable'
      })
    );
    if (isFolded) {
      for (let j = i + 1; j < kids.length; j++) {
        const c = kids[j];
        if (c.node.type.name === 'heading' && (c.node.attrs.level as number) <= level) break;
        decos.push(Decoration.node(c.offset, c.offset + c.node.nodeSize, { class: 'omd-fold-hidden' }));
      }
    }
  }
  return DecorationSet.create(doc, decos);
}

export const headingFoldPlugin = $prose(
  () =>
    new Plugin<Set<number>>({
      key,
      state: {
        init: () => new Set<number>(),
        apply(tr, folded) {
          let next = folded;
          if (tr.docChanged) {
            // Remap fold positions through the edit, dropping any that no longer sit on a heading.
            next = new Set<number>();
            folded.forEach((pos) => {
              const mapped = tr.mapping.map(pos, -1);
              const node = tr.doc.nodeAt(mapped);
              if (node && node.type.name === 'heading') next.add(mapped);
            });
          }
          const meta = tr.getMeta(key) as { toggle?: number } | undefined;
          if (meta?.toggle != null) {
            next = new Set(next);
            if (next.has(meta.toggle)) next.delete(meta.toggle);
            else next.add(meta.toggle);
          }
          return next;
        }
      },
      props: {
        decorations(state) {
          return build(state.doc, key.getState(state) ?? new Set());
        }
      }
    })
);
