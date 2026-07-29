import { $prose } from '@milkdown/utils';
import { schemaCtx } from '@milkdown/core';
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { searchEmoji, type Emoji } from './emoji-data';

/**
 * `:name:` emoji autocomplete (Phase 6). Typing `:` followed by a letter opens a filtered list;
 * choosing one inserts the **`:name:` shortcode** — the GitHub-source form, so the bytes on disk
 * stay portable. The editor renders it as the emoji glyph (`plugins/emoji-decoration.ts`), and the
 * GitHub preview / HTML export convert it too. Mirrors the mention menu's shape (one surface,
 * keyboard-driven), and reuses its `.omd-slash-menu` chrome.
 */

interface Trigger {
  active: boolean;
  from: number; // position of the ':'
  query: string;
}

const INACTIVE: Trigger = { active: false, from: -1, query: '' };
// A ':' at block start or after whitespace opens the picker right away (a default set), then filters
// as you type the name. The start/whitespace anchor keeps it from firing on an attached colon like
// `Note:` or `3:00` — only a colon that begins a token triggers.
const TRIGGER = /(?:^|\s):([a-z0-9_+-]*)$/i;

function readTrigger(view: EditorView): Trigger {
  const { selection } = view.state;
  if (!(selection instanceof TextSelection) || !selection.empty) return INACTIVE;
  const $pos = selection.$from;
  if (!$pos.parent.isTextblock) return INACTIVE;
  const start = $pos.start();
  const before = $pos.parent.textBetween(0, $pos.parentOffset, undefined, '￼');
  const m = TRIGGER.exec(before);
  if (!m) return INACTIVE;
  const from = start + (m.index === 0 ? 0 : m.index + 1); // skip a leading space
  return { active: true, from, query: m[1] };
}

class EmojiMenu {
  private readonly el: HTMLElement;
  private items: Emoji[] = [];
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
    this.items = searchEmoji(t.query);
    if (this.items.length === 0) return this.close();
    this.selected = Math.min(this.selected, this.items.length - 1);
    this.render(t);
  }

  private render(t: Trigger): void {
    this.el.innerHTML = '';
    this.items.forEach((item, i) => {
      const row = document.createElement('div');
      row.className = 'omd-slash-item' + (i === this.selected ? ' omd-slash-item--active' : '');
      const glyph = document.createElement('span');
      glyph.className = 'omd-emoji-glyph';
      glyph.textContent = item.char;
      const label = document.createElement('span');
      label.className = 'omd-slash-label';
      label.textContent = `:${item.name}:`;
      row.append(glyph, label);
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
    const to = this.view.state.selection.from;
    // Insert the `:name:` shortcode (kept on disk); the decoration renders it as the emoji.
    const tr = this.view.state.tr.delete(t.from, to);
    tr.insertText(`:${item.name}:`, t.from);
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

const key = new PluginKey('omd-emoji-menu');

export const emojiMenuPlugin = $prose((ctx) => {
  ctx.get(schemaCtx); // order after the schema is ready
  let menu: EmojiMenu | null = null;

  return new Plugin({
    key,
    view: (view) => {
      menu = new EmojiMenu(view);
      // The search + list render is debounced so the popup doesn't churn on every keystroke; closing
      // (trigger gone) is immediate so it never lingers.
      let timer: ReturnType<typeof setTimeout> | undefined;
      return {
        update: (v) => {
          const t = readTrigger(v);
          (v as unknown as { _omdEmoji?: Trigger })._omdEmoji = t;
          if (timer) clearTimeout(timer);
          if (!t.active) {
            menu?.close();
            return;
          }
          timer = setTimeout(() => menu?.update(t), 120);
        },
        destroy: () => {
          if (timer) clearTimeout(timer);
          menu?.destroy();
        }
      };
    },
    props: {
      handleKeyDown: (view, event) => {
        if (!menu?.isOpen) return false;
        const t = (view as unknown as { _omdEmoji?: Trigger })._omdEmoji;
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
