import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { EditorView } from 'prosemirror-view';
import { codicon } from '../../codicons';
import { findMatches, expandReplacement, type Match } from './engine';

/**
 * Find & Replace (Phase 4). One ProseMirror plugin owns the search state, the match
 * highlighting (decorations), and a docked find bar. All matching lives in the pure engine
 * (./engine); this file is state transitions + chrome. The bar drives everything by
 * dispatching metas, and `openFind`/`closeFind` are the imperative entry points the keymap
 * and a toolbar button call — one command surface, as everywhere else.
 */

interface FindState {
  active: boolean;
  query: string;
  caseSensitive: boolean;
  regex: boolean;
  index: number;
  matches: Match[];
}

const EMPTY: FindState = {
  active: false,
  query: '',
  caseSensitive: false,
  regex: false,
  index: 0,
  matches: []
};

type FindMeta =
  | { kind: 'open'; query: string }
  | { kind: 'close' }
  | { kind: 'setQuery'; query: string }
  | { kind: 'toggleCase' }
  | { kind: 'toggleRegex' }
  | { kind: 'move'; delta: number };

const findKey = new PluginKey<FindState>('omd-find');

/** The single docked bar; kept module-level so commands can focus it (one editor). */
let bar: FindBar | null = null;

// --- imperative commands (keymap, toolbar, bar buttons all call these) ---

export function openFind(view: EditorView): void {
  const st = findKey.getState(view.state);
  let query = st?.query ?? '';
  const { from, to, empty } = view.state.selection;
  if (!empty) {
    const sel = view.state.doc.textBetween(from, to, '');
    if (sel && !sel.includes('\n')) query = sel;
  }
  view.dispatch(view.state.tr.setMeta(findKey, { kind: 'open', query }));
  bar?.focusFind();
}

export function closeFind(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(findKey, { kind: 'close' }));
  view.focus();
}

function move(view: EditorView, delta: number): void {
  view.dispatch(view.state.tr.setMeta(findKey, { kind: 'move', delta }));
  const st = findKey.getState(view.state);
  const m = st?.matches[st.index];
  if (m) revealAndScroll(view, m.from);
}

/** The element the match starts in (an Element, resolving a text node to its parent). */
function matchElement(view: EditorView, pos: number): HTMLElement | null {
  try {
    const at = view.domAtPos(pos);
    return at.node.nodeType === Node.ELEMENT_NODE
      ? (at.node as HTMLElement)
      : at.node.parentElement;
  } catch {
    return null;
  }
}

/**
 * Reveal a match that lives in a collapsed container (an inactive tab, a closed section),
 * then scroll it into view. Revealing is a bubbling `omd:reveal` event that the relevant
 * NodeViews handle by unfolding themselves; the scroll waits a frame for the new layout.
 * The editor selection is never moved — so the toolbar doesn't light up as find navigates.
 */
function revealAndScroll(view: EditorView, pos: number): void {
  const el = matchElement(view, pos);
  if (!el) return;
  el.dispatchEvent(new CustomEvent('omd:reveal', { bubbles: true }));
  requestAnimationFrame(() => {
    matchElement(view, pos)?.scrollIntoView({ block: 'center' });
  });
}

/** The replacement text for a match, expanding regex backreferences ($1, $&) in regex mode. */
function replacementFor(view: EditorView, m: Match, template: string): string {
  const st = findKey.getState(view.state);
  if (!st) return template;
  const matched = view.state.doc.textBetween(m.from, m.to, '');
  return expandReplacement(matched, st.query, { caseSensitive: st.caseSensitive, regex: st.regex }, template);
}

function replaceCurrent(view: EditorView, replacement: string): void {
  const st = findKey.getState(view.state);
  const m = st?.matches[st.index];
  if (!st?.active || !m) return;
  view.dispatch(view.state.tr.insertText(replacementFor(view, m, replacement), m.from, m.to));
}

function replaceAll(view: EditorView, replacement: string): void {
  const st = findKey.getState(view.state);
  if (!st?.active || st.matches.length === 0) return;
  let tr = view.state.tr;
  // Apply from the end so earlier replacements don't shift later match positions.
  for (let i = st.matches.length - 1; i >= 0; i--) {
    const m = st.matches[i];
    tr = tr.insertText(replacementFor(view, m, replacement), m.from, m.to);
  }
  view.dispatch(tr);
}

// --- state ---

function apply(tr: import('prosemirror-state').Transaction, prev: FindState): FindState {
  const meta = tr.getMeta(findKey) as FindMeta | undefined;
  let { active, query, caseSensitive, regex, index } = prev;

  if (meta) {
    switch (meta.kind) {
      case 'open':
        active = true;
        query = meta.query;
        index = 0;
        break;
      case 'close':
        active = false;
        break;
      case 'setQuery':
        query = meta.query;
        index = 0;
        break;
      case 'toggleCase':
        caseSensitive = !caseSensitive;
        index = 0;
        break;
      case 'toggleRegex':
        regex = !regex;
        index = 0;
        break;
    }
  }

  if (!active) return { ...EMPTY, query, caseSensitive, regex };

  // All matches across the document — including text in collapsed tabs/sections, which
  // navigation reveals (revealMatch) rather than hides.
  const matches = findMatches(tr.doc, query, { caseSensitive, regex });
  if (meta?.kind === 'move' && matches.length > 0) {
    index = (((index + meta.delta) % matches.length) + matches.length) % matches.length;
  }
  if (index >= matches.length) index = 0;
  return { active, query, caseSensitive, regex, index, matches };
}

function decorations(state: import('prosemirror-state').EditorState): DecorationSet {
  const st = findKey.getState(state);
  if (!st?.active || st.matches.length === 0) return DecorationSet.empty;
  const decos = st.matches.map((m, i) =>
    Decoration.inline(m.from, m.to, {
      class: i === st.index ? 'omd-find-match omd-find-match--current' : 'omd-find-match'
    })
  );
  return DecorationSet.create(state.doc, decos);
}

// --- the docked bar ---

class FindBar {
  private readonly el: HTMLElement;
  private readonly findInput: HTMLInputElement;
  private readonly replaceInput: HTMLInputElement;
  private readonly count: HTMLElement;
  private readonly caseBtn: HTMLButtonElement;
  private readonly regexBtn: HTMLButtonElement;

  constructor(private readonly view: EditorView) {
    this.el = document.createElement('div');
    this.el.className = 'omd-find-bar';
    this.el.style.display = 'none';

    const btn = (icon: string, title: string, onClick: () => void, label?: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'omd-find-btn';
      b.title = title;
      if (label) {
        b.classList.add('omd-find-btn--text');
        b.textContent = label;
      } else {
        b.appendChild(codicon(icon));
      }
      b.addEventListener('mousedown', (e) => {
        e.preventDefault();
        onClick();
      });
      return b;
    };

    // Find row
    const findRow = document.createElement('div');
    findRow.className = 'omd-find-row';
    this.findInput = document.createElement('input');
    this.findInput.type = 'text';
    this.findInput.className = 'omd-find-input';
    this.findInput.placeholder = 'Find';
    this.findInput.addEventListener('input', () => {
      this.view.dispatch(
        this.view.state.tr.setMeta(findKey, { kind: 'setQuery', query: this.findInput.value })
      );
    });
    this.findInput.addEventListener('keydown', (e) => this.onInputKey(e));

    this.count = document.createElement('span');
    this.count.className = 'omd-find-count';

    this.caseBtn = btn('', 'Match case', () => {
      this.view.dispatch(this.view.state.tr.setMeta(findKey, { kind: 'toggleCase' }));
    }, 'Aa');
    this.regexBtn = btn('', 'Regular expression', () => {
      this.view.dispatch(this.view.state.tr.setMeta(findKey, { kind: 'toggleRegex' }));
    }, '.*');

    findRow.append(
      this.findInput,
      this.count,
      this.caseBtn,
      this.regexBtn,
      btn('arrow-up', 'Previous match (⇧⏎)', () => move(this.view, -1)),
      btn('arrow-down', 'Next match (⏎)', () => move(this.view, 1)),
      btn('close', 'Close (Esc)', () => closeFind(this.view))
    );

    // Replace row
    const replaceRow = document.createElement('div');
    replaceRow.className = 'omd-find-row';
    this.replaceInput = document.createElement('input');
    this.replaceInput.type = 'text';
    this.replaceInput.className = 'omd-find-input';
    this.replaceInput.placeholder = 'Replace';
    this.replaceInput.addEventListener('keydown', (e) => this.onInputKey(e));
    replaceRow.append(
      this.replaceInput,
      btn('', 'Replace', () => replaceCurrent(this.view, this.replaceInput.value), 'Replace'),
      btn('', 'Replace all', () => replaceAll(this.view, this.replaceInput.value), 'All')
    );

    this.el.append(findRow, replaceRow);
    document.body.appendChild(this.el);
  }

  private onInputKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeFind(this.view);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      move(this.view, e.shiftKey ? -1 : 1);
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault();
      this.focusFind();
    }
  }

  focusFind(): void {
    this.el.style.display = '';
    this.findInput.focus();
    this.findInput.select();
  }

  update(): void {
    const st = findKey.getState(this.view.state);
    if (!st?.active) {
      this.el.style.display = 'none';
      return;
    }
    this.el.style.display = '';
    if (this.findInput.value !== st.query) this.findInput.value = st.query;
    this.count.textContent = st.matches.length
      ? `${st.index + 1} of ${st.matches.length}`
      : st.query
        ? 'No results'
        : '';
    this.caseBtn.classList.toggle('omd-find-btn--active', st.caseSensitive);
    this.regexBtn.classList.toggle('omd-find-btn--active', st.regex);
  }

  destroy(): void {
    this.el.remove();
    if (bar === this) bar = null;
  }
}

export const findReplacePlugin = $prose(
  () =>
    new Plugin<FindState>({
      key: findKey,
      state: {
        init: () => EMPTY,
        apply
      },
      props: {
        decorations,
        handleKeyDown: (view, event) => {
          const st = findKey.getState(view.state);
          if (st?.active && event.key === 'Escape') {
            closeFind(view);
            return true;
          }
          return false;
        }
      },
      view: (view) => {
        bar = new FindBar(view);
        // Mod-F at the document level, so it opens find no matter what inside the webview has
        // focus (the editable, a comment box, or nothing) — not only when the editable is
        // focused, which is all ProseMirror's own handleKeyDown would cover.
        const onDocKey = (e: KeyboardEvent) => {
          if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === 'f' || e.key === 'F')) {
            e.preventDefault();
            openFind(view);
          }
        };
        document.addEventListener('keydown', onDocKey, true);
        return {
          update: () => bar?.update(),
          destroy: () => {
            document.removeEventListener('keydown', onDocKey, true);
            bar?.destroy();
          }
        };
      }
    })
);
