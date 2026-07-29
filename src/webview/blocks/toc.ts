import type { EditorView } from 'prosemirror-view';
import { TextSelection } from 'prosemirror-state';

/**
 * The `toc` built-in block: a live table of contents. It is a leaf shortcode
 * (`<!-- omd:toc {} -->`) that renders from the document's headings and refreshes as they
 * change — clicking an entry moves the cursor to that heading. The block's *output* is
 * derived (never serialized), so on disk it stays the invisible shortcode and round-trips
 * (docs/design/FORMATS.md); the visible list is OMD's rendering.
 */

interface Heading {
  level: number;
  text: string;
  pos: number;
}

/** Collect the document's headings in order, with the position of each. */
export function collectHeadings(view: EditorView): Heading[] {
  const headings: Heading[] = [];
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      headings.push({ level: Number(node.attrs.level) || 1, text: node.textContent, pos });
      return false;
    }
    return true;
  });
  return headings;
}

/** Move the selection to a heading and scroll it into view. */
function goToHeading(view: EditorView, pos: number): void {
  const tr = view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos + 1)));
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

/**
 * Build the table-of-contents element for the current document. Params: `maxLevel` caps the
 * heading depth shown, `ordered` renders a numbered list instead of a bulleted one.
 */
export function renderToc(view: EditorView, params: Record<string, unknown> = {}): HTMLElement {
  const out = document.createElement('nav');
  out.className = 'omd-block-output omd-toc';

  const maxLevel = Number(params.maxLevel) || 6;
  const ordered = params.ordered === true || params.ordered === 'true';

  const headings = collectHeadings(view).filter((h) => h.level <= maxLevel);
  if (headings.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'omd-toc-empty';
    empty.textContent = 'No headings yet';
    out.appendChild(empty);
    return out;
  }

  // Indent relative to the shallowest heading present, so a doc starting at H2 still reads.
  const minLevel = Math.min(...headings.map((h) => h.level));
  const list = document.createElement('ul');
  list.className = 'omd-toc-list';
  // Hierarchical section numbers (1, 1.1, 1.2, 2, …) — the list markers are hidden by CSS, so
  // `ordered` prepends explicit numbers rather than relying on an <ol> marker.
  const counters: number[] = [];
  for (const h of headings) {
    const depth = h.level - minLevel;
    const item = document.createElement('li');
    item.className = 'omd-toc-item';
    item.style.paddingLeft = `${depth * 16}px`;
    const link = document.createElement('a');
    link.className = 'omd-toc-link';
    if (ordered) {
      counters[depth] = (counters[depth] ?? 0) + 1;
      counters.length = depth + 1; // reset deeper counters under a new shallower heading
      const num = document.createElement('span');
      num.className = 'omd-toc-number';
      num.textContent = `${counters.join('.')}. `;
      link.appendChild(num);
    }
    link.appendChild(document.createTextNode(h.text || '(untitled)'));
    link.addEventListener('mousedown', (e) => {
      e.preventDefault();
      goToHeading(view, h.pos);
    });
    item.appendChild(link);
    list.appendChild(item);
  }
  out.appendChild(list);
  return out;
}
