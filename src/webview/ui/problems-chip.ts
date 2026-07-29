import type { EditorView } from 'prosemirror-view';
import { TextSelection } from 'prosemirror-state';
import { diagnose, type Diagnostic } from '../../shared/diagnostics';
import { onEditorUpdate } from '../commands/state-events';
import { codicon } from '../codicons';
import type { OmdEditorHandle } from '../editor';

/**
 * The document-issues chip: OMD's inline replacement for the Problems panel (showcase/BUGS.md). Most
 * problems are marked where they occur — a link's wavy underline, the front-matter error banner —
 * but this chip is the aggregate view and the home for problems with no clean inline anchor
 * (unclosed HTML comments, unbalanced `<details>`/`<table>`). It also gives an all-clear signal.
 *
 * It runs the same pure `diagnose()` the host used to, on the editor's serialized markdown
 * (debounced), and lets a click on an item jump to a best-effort location in the doc.
 *
 * The chip sits at the far right of the toolbar (`parent` is the toolbar bar). Its dropdown list
 * lives on `document.body` — not inside the flex toolbar, where a shown block child would disrupt
 * the layout — and is positioned under the chip on open.
 */
export function mountProblemsChip(parent: HTMLElement, handle: OmdEditorHandle): () => void {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'omd-problems-chip';

  const list = document.createElement('div');
  list.className = 'omd-problems-list';
  list.style.display = 'none';

  parent.appendChild(chip);
  document.body.appendChild(list);

  const positionList = () => {
    const r = chip.getBoundingClientRect();
    list.style.top = `${r.bottom + 4}px`;
    list.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
  };

  let open = false;
  const setOpen = (v: boolean) => {
    open = v;
    list.style.display = v ? '' : 'none';
    if (v) positionList();
  };

  chip.addEventListener('click', () => setOpen(!open));
  document.addEventListener('mousedown', (e) => {
    if (open && !chip.contains(e.target as Node) && !list.contains(e.target as Node)) setOpen(false);
  });

  // The current problem set + a cursor for keyboard next/previous.
  let current: Diagnostic[] = [];
  let cursor = -1;

  const render = (problems: Diagnostic[]) => {
    current = problems;
    if (cursor >= problems.length) cursor = -1;
    const errors = problems.filter((p) => p.severity === 'error').length;
    chip.classList.toggle('omd-problems-chip--clean', problems.length === 0);
    chip.classList.toggle('omd-problems-chip--error', errors > 0);
    // Compact: icon + count, so it fits at the toolbar's right edge. The full phrasing is the
    // tooltip; the click opens the itemized list.
    const count = problems.length;
    chip.title = count === 0 ? 'No issues' : `${count} issue${count > 1 ? 's' : ''}`;
    chip.replaceChildren(
      codicon(count === 0 ? 'check' : errors > 0 ? 'error' : 'warning'),
      ...(count === 0 ? [] : [label(String(count))])
    );
    if (count === 0) {
      setOpen(false);
      list.replaceChildren();
      return;
    }
    list.replaceChildren(
      ...problems.map((p) => {
        const row = document.createElement('div');
        row.className = `omd-problems-item omd-problems-item--${p.severity}`;
        const jump = document.createElement('button');
        jump.type = 'button';
        jump.className = 'omd-problems-jump';
        jump.append(codicon(p.severity === 'error' ? 'error' : 'warning'), label(p.message));
        jump.addEventListener('click', () => {
          locate(handle.getView(), p);
          setOpen(false);
        });
        row.appendChild(jump);
        // A one-click fix for problems that carry a suggestion (today: bad anchor → nearest heading).
        if (p.fix) {
          const fix = document.createElement('button');
          fix.type = 'button';
          fix.className = 'omd-problems-fix';
          fix.textContent = 'Fix';
          fix.title = p.fix.title;
          fix.addEventListener('click', () => {
            applyFix(handle.getView(), p);
            setOpen(false);
          });
          row.appendChild(fix);
        }
        return row;
      })
    );
  };

  // Recompute on document changes, debounced (serializing the doc isn't free).
  let timer: ReturnType<typeof setTimeout> | undefined;
  const recompute = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => render(diagnose(handle.getMarkdown())), 300);
  };
  const off = onEditorUpdate(recompute);
  render(diagnose(handle.getMarkdown())); // initial

  // Keyboard next/previous problem (F8 / Shift+F8, matching VS Code's convention — the Problems
  // panel that used to own those keys is gone). Only while the editor is focused, so it never steals
  // the keys elsewhere. Each step scrolls + flashes the problem's location.
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'F8' || e.altKey || e.ctrlKey || e.metaKey) return;
    if (!handle.getView().hasFocus() || current.length === 0) return;
    e.preventDefault();
    cursor = e.shiftKey
      ? (cursor - 1 + current.length) % current.length
      : (cursor + 1) % current.length;
    locate(handle.getView(), current[cursor]);
  };
  document.addEventListener('keydown', onKey, true);

  return () => {
    off();
    document.removeEventListener('keydown', onKey, true);
    if (timer) clearTimeout(timer);
    chip.remove();
    list.remove();
  };
}

/**
 * Apply a diagnostic's suggested fix. Today only the bad-anchor "did you mean" rewrite carries one:
 * find the link mark whose href is the unmatched anchor and re-point it at the suggested heading.
 */
function applyFix(view: EditorView, d: Diagnostic): void {
  if (!d.fix) return;
  const oldHref = /anchor "(#[^"]+)"/.exec(d.message)?.[1];
  const newHref = d.fix.text;
  const linkType = view.state.schema.marks.link;
  if (!oldHref || !linkType) return;

  let done = false;
  view.state.doc.descendants((node, pos) => {
    if (done || !node.isText) return true;
    const link = node.marks.find((m) => m.type.name === 'link');
    if (link && String(link.attrs.href ?? '') === oldHref) {
      const from = pos;
      const to = pos + node.nodeSize;
      view.dispatch(
        view.state.tr
          .removeMark(from, to, linkType)
          .addMark(from, to, linkType.create({ ...link.attrs, href: newHref }))
      );
      done = true;
      return false;
    }
    return true;
  });
}

function label(text: string): HTMLElement {
  const span = document.createElement('span');
  span.textContent = text;
  return span;
}

/**
 * Best-effort jump to a diagnostic's location. Diagnostics carry raw-source offsets that don't map
 * to the rendered doc, so we re-find the offending construct by kind and scroll+flash it.
 */
function locate(view: EditorView, d: Diagnostic): void {
  const pos = findPos(view, d);
  if (pos == null) return;
  view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos))).scrollIntoView());
  view.focus();
  flash(view, pos);
}

function findPos(view: EditorView, d: Diagnostic): number | null {
  const doc = view.state.doc;
  if (d.code === 'frontmatter') {
    let pos: number | null = null;
    doc.descendants((n, p) => {
      if (pos == null && n.type.name === 'frontmatter') pos = p + 1;
      return pos == null;
    });
    return pos;
  }
  // The anchor of a bad-anchor message, e.g. `#intro`, for matching the link mark.
  const anchor = /matches "(#[^"]+)"/.exec(d.message)?.[1]?.toLowerCase();
  let pos: number | null = null;
  doc.descendants((n, p) => {
    if (pos != null) return false;
    if (!n.isText) return true;
    const link = n.marks.find((m) => m.type.name === 'link');
    const href = link ? String(link.attrs.href ?? '').trim() : null;
    if (d.code === 'empty-link' && href === '') pos = p;
    else if (d.code === 'bad-anchor' && href && (anchor ? href.toLowerCase() === anchor : href.startsWith('#')))
      pos = p;
    else if ((d.code === 'unclosed-html' || d.code === 'unbalanced-html') && /<!--|<\/?(?:details|table)\b/i.test(n.text ?? ''))
      pos = p;
    return pos == null;
  });
  return pos;
}

/** Briefly highlight the DOM node at `pos`. */
function flash(view: EditorView, pos: number): void {
  const dom = view.domAtPos(pos)?.node as HTMLElement | undefined;
  const el = dom?.nodeType === 1 ? dom : (dom?.parentElement ?? null);
  if (!el) return;
  el.classList.add('omd-problem-flash');
  setTimeout(() => el.classList.remove('omd-problem-flash'), 1200);
}
