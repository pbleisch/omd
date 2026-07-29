import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import type { Node as ProseNode } from 'prosemirror-model';
import { codicon } from '../codicons';
import { CALLOUT_KINDS, CALLOUT_MARKER, type CalloutKind } from '../blocks/callout-kinds';

/**
 * Render GitHub alerts (`> [!NOTE]` …) as styled callouts. These are *native* GFM —
 * a blockquote whose first line is an alert marker — so OMD recognizes and renders
 * them richly without any shortcode (docs/design/SMART-BLOCKS.md, "Native patterns"). This is
 * decoration-only: it never edits the document, so the round-trip is untouched.
 *
 * GFM alerts are intentionally *pure* — no params, no chrome. A fixed label/icon/color per type;
 * the body is ordinary editable blockquote content. For a custom title/icon/color, use the
 * OMD **smart callout** (`omd:callout`) instead.
 */

function titleWidget(kind: CalloutKind, onDelete: () => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'omd-callout-title';
  row.style.color = kind.accent;
  row.contentEditable = 'false';

  const label = document.createElement('span');
  label.className = 'omd-callout-title-label';
  label.append(codicon(kind.icon));
  const text = document.createElement('span');
  text.textContent = kind.label;
  label.appendChild(text);

  // A hover-revealed delete — the alert's marker line is hidden, so there's otherwise no way to
  // remove the whole callout once its body is emptied.
  const del = document.createElement('button');
  del.className = 'omd-callout-delete';
  del.type = 'button';
  del.title = 'Delete callout';
  del.setAttribute('aria-label', 'Delete callout');
  del.appendChild(codicon('trash'));
  del.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  del.addEventListener('click', (e) => {
    e.preventDefault();
    onDelete();
  });

  row.append(label, del);
  return row;
}

/** Delete the whole callout blockquote at `pos` (including its hidden marker line). */
function deleteCallout(view: EditorView, pos: number): void {
  const node = view.state.doc.nodeAt(pos);
  if (!node) return;
  view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize).scrollIntoView());
  view.focus();
}

function buildDecorations(doc: ProseNode): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'blockquote' || node.childCount === 0) return;
    const first = node.child(0);
    const match = CALLOUT_MARKER.exec(first.textContent);
    if (!match) return;

    const kindKey = match[1].toLowerCase();
    const kind = CALLOUT_KINDS[kindKey];
    const markerLen = match[0].length;

    // Accent border + tinted background on the whole blockquote.
    decos.push(
      Decoration.node(pos, pos + node.nodeSize, {
        class: `omd-callout omd-callout--${kindKey}`,
        style: `--omd-callout-accent: ${kind.accent};`
      })
    );
    // The title row (icon + label + hover delete) before the body.
    decos.push(
      Decoration.widget(pos + 1, (view) => titleWidget(kind, () => deleteCallout(view, pos)), {
        side: -1
      })
    );

    // Hide the raw marker. If the first paragraph is only the marker, hide the whole
    // paragraph so no empty line remains; otherwise hide just the `[!KIND]` token.
    const paraStart = pos + 1;
    if (first.textContent.trim() === match[0]) {
      decos.push(
        Decoration.node(paraStart, paraStart + first.nodeSize, { class: 'omd-callout-marker' })
      );
    } else {
      const textStart = paraStart + 1;
      decos.push(
        Decoration.inline(textStart, textStart + markerLen, { class: 'omd-callout-marker' })
      );
    }
    return false; // don't descend into the blockquote
  });
  return DecorationSet.create(doc, decos);
}

const calloutKey = new PluginKey('omd-callouts');

export const calloutPlugin = $prose(
  () =>
    new Plugin({
      key: calloutKey,
      props: {
        decorations(state) {
          return buildDecorations(state.doc);
        }
      }
    })
);
