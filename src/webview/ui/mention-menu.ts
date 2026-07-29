import { $prose } from '@milkdown/utils';
import { schemaCtx } from '@milkdown/core';
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { getContributors, getIssues } from '../blocks/github-registry';
import { documentHeadings } from '../blocks/anchors';

/**
 * Autocomplete for `@mentions`, `#issues`, and section links. Typing `@`/`#` opens a
 * filtered list from the host's GitHub data; typing a link anchor `[label](#…` opens the document's
 * headings. Choosing an item inserts a *real link* (the same bytes FORMATS.md fixes), which the
 * references plugin then styles — so a section link is a plain `[text](#slug)` that also works on
 * GitHub (a `[[#…]]` wikilink would not). One menu handles every trigger (docs/design/STYLE.md, Principle 4).
 */

type Kind = '@' | '#' | 'anchor';

interface Trigger {
  active: boolean;
  kind: Kind;
  from: number; // position where the replaced text starts (the trigger char, or the `[`)
  query: string;
  /** For an `anchor` trigger, the link label the user typed between `[` and `]` (may be empty). */
  label: string;
}

interface RefItem {
  /** The reference/display text, e.g. `@alice`, `#123`, or a heading's text. */
  ref: string;
  /** Secondary text (a profile, an issue title, or the `#slug`). */
  detail: string;
  href: string;
}

const INACTIVE: Trigger = { active: false, kind: '@', from: -1, query: '', label: '' };
const REF_TRIGGER = /(?:^|\s)([@#])([\w-]*)$/;
// A markdown link anchor being typed: `[label](#query` (label optional), cursor right after query.
const ANCHOR_TRIGGER = /\[([^\]]*)\]\(#([\w-]*)$/;

function readTrigger(view: EditorView): Trigger {
  const { selection } = view.state;
  if (!(selection instanceof TextSelection) || !selection.empty) return INACTIVE;
  const $pos = selection.$from;
  if (!$pos.parent.isTextblock) return INACTIVE;
  const start = $pos.start();
  const before = $pos.parent.textBetween(0, $pos.parentOffset, undefined, '￼');

  // A section-link anchor takes precedence — its `#` sits after `](`, not at a word boundary.
  const a = ANCHOR_TRIGGER.exec(before);
  if (a) return { active: true, kind: 'anchor', from: start + a.index, query: a[2], label: a[1] };

  const m = REF_TRIGGER.exec(before);
  if (!m) return INACTIVE;
  const from = start + (m.index === 0 ? 0 : m.index + 1); // skip a leading space
  return { active: true, kind: m[1] as Kind, from, query: m[2], label: '' };
}

function itemsFor(view: EditorView, t: Trigger): RefItem[] {
  const q = t.query.toLowerCase();
  if (t.kind === '@') {
    return getContributors()
      .filter((c) => c.login.toLowerCase().includes(q))
      .slice(0, 8)
      .map((c) => ({ ref: `@${c.login}`, detail: 'contributor', href: c.url }));
  }
  if (t.kind === '#') {
    return getIssues()
      .filter((i) => String(i.number).startsWith(q) || i.title.toLowerCase().includes(q))
      .slice(0, 8)
      .map((i) => ({ ref: `#${i.number}`, detail: i.title, href: i.url }));
  }
  // Section links: the document's headings, matched by slug or text.
  return documentHeadings(view.state.doc)
    .filter((h) => q === '' || h.slug.includes(q) || h.text.toLowerCase().includes(q))
    .slice(0, 8)
    .map((h) => ({ ref: h.text, detail: `#${h.slug}`, href: `#${h.slug}` }));
}

class RefMenu {
  private readonly el: HTMLElement;
  private items: RefItem[] = [];
  private selected = 0;

  constructor(private readonly view: EditorView) {
    this.el = document.createElement('div');
    this.el.className = 'omd-slash-menu omd-ref-menu';
    this.el.style.display = 'none';
    document.body.appendChild(this.el);
  }

  get isOpen(): boolean {
    return this.el.style.display !== 'none';
  }

  update(t: Trigger): void {
    if (!t.active) return this.close();
    this.items = itemsFor(this.view, t);
    if (this.items.length === 0) return this.close();
    this.selected = Math.min(this.selected, this.items.length - 1);
    this.render(t);
  }

  private render(t: Trigger): void {
    this.el.innerHTML = '';
    this.items.forEach((item, i) => {
      const row = document.createElement('div');
      row.className = 'omd-slash-item' + (i === this.selected ? ' omd-slash-item--active' : '');
      const label = document.createElement('span');
      label.className = 'omd-slash-label';
      label.textContent = item.ref;
      const detail = document.createElement('span');
      detail.className = 'omd-ref-detail';
      detail.textContent = item.detail;
      row.append(label, detail);
      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.choose(i, t);
      });
      row.addEventListener('mouseenter', () => {
        this.selected = i;
        this.highlight();
      });
      this.el.appendChild(row);
    });
    const coords = this.view.coordsAtPos(t.from);
    this.el.style.left = `${coords.left}px`;
    this.el.style.top = `${coords.bottom + 4}px`;
    this.el.style.display = '';
  }

  private highlight(): void {
    this.el.querySelectorAll('.omd-slash-item').forEach((el, i) =>
      el.classList.toggle('omd-slash-item--active', i === this.selected)
    );
  }

  move(delta: number): void {
    if (!this.isOpen) return;
    this.selected = (this.selected + delta + this.items.length) % this.items.length;
    this.highlight();
  }

  commit(t: Trigger): void {
    this.choose(this.selected, t);
  }

  private choose(index: number, t: Trigger): void {
    const item = this.items[index];
    if (!item) return;
    const link = this.view.state.schema.marks.link;
    if (!link) return this.close();
    const to = this.view.state.selection.from;
    // The visible text: `@alice`/`#123` for refs; for a section link the label the user typed, or
    // the heading's own text when they left it empty (`[](#…` → `[Heading Text](#slug)`).
    const text = t.kind === 'anchor' ? t.label.trim() || item.ref : item.ref;
    // Replace the typed trigger (`@query`, `#query`, or `[label](#query`) with the linked text + a
    // trailing space (the space stays outside the mark, so typing on continues unlinked).
    const tr = this.view.state.tr.delete(t.from, to);
    tr.insertText(`${text} `, t.from);
    tr.addMark(t.from, t.from + text.length, link.create({ href: item.href }));
    this.view.dispatch(tr.scrollIntoView());
    this.close();
    this.view.focus();
  }

  close(): void {
    this.el.style.display = 'none';
    this.selected = 0;
  }

  destroy(): void {
    this.el.remove();
  }
}

const key = new PluginKey('omd-mention-menu');

export const mentionMenuPlugin = $prose((ctx) => {
  ctx.get(schemaCtx); // order after the schema is ready
  let menu: RefMenu | null = null;

  return new Plugin({
    key,
    view: (view) => {
      menu = new RefMenu(view);
      return {
        update: (v) => {
          const t = readTrigger(v);
          (v as unknown as { _omdRef?: Trigger })._omdRef = t;
          menu?.update(t);
        },
        destroy: () => menu?.destroy()
      };
    },
    props: {
      handleKeyDown: (view, event) => {
        if (!menu?.isOpen) return false;
        const t = (view as unknown as { _omdRef?: Trigger })._omdRef;
        switch (event.key) {
          case 'ArrowDown':
            event.preventDefault();
            menu.move(1);
            return true;
          case 'ArrowUp':
            event.preventDefault();
            menu.move(-1);
            return true;
          case 'Enter':
          case 'Tab':
            event.preventDefault();
            if (t) menu.commit(t);
            return true;
          case 'Escape':
            event.preventDefault();
            menu.close();
            return true;
          default:
            return false;
        }
      }
    }
  });
});
