import { $prose } from '@milkdown/utils';
import { schemaCtx } from '@milkdown/core';
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { buildCommands, type OmdCommand } from '../commands/registry';
import { blockInsertCommands } from '../blocks/insert';
import { codicon } from '../codicons';

/**
 * The slash menu: type `/` to insert a block, filtered as you type (Principle 4 — the
 * same registry commands as the toolbar and shortcuts). Choosing an item deletes the
 * `/query` and runs the command, so structure arrives as one deliberate act, never as
 * spliced characters (Principle 3). Exactly one menu exists (Principle 4).
 */
interface SlashState {
  active: boolean;
  from: number; // position of the `/`
  query: string;
}

const key = new PluginKey<SlashState>('omd-slash');
const INACTIVE: SlashState = { active: false, from: -1, query: '' };

// A `/` at block start or after whitespace, followed by word chars up to the cursor.
const TRIGGER = /(?:^|\s)\/([\w-]*)$/;

function readTrigger(view: EditorView): SlashState {
  const { selection } = view.state;
  if (!(selection instanceof TextSelection) || !selection.empty) return INACTIVE;
  const $pos = selection.$from;
  if (!$pos.parent.isTextblock) return INACTIVE;
  const start = $pos.start();
  const textBefore = $pos.parent.textBetween(0, $pos.parentOffset, undefined, '￼');
  const m = TRIGGER.exec(textBefore);
  if (!m) return INACTIVE;
  const query = m[1];
  const from = start + (m.index === 0 ? 0 : m.index + 1); // skip the leading space if any
  return { active: true, from, query };
}

class SlashMenu {
  private readonly el: HTMLElement;
  private items: OmdCommand[] = [];
  private selected = 0;

  constructor(private readonly view: EditorView) {
    this.el = document.createElement('div');
    this.el.className = 'omd-slash-menu';
    this.el.style.display = 'none';
    document.body.appendChild(this.el);
  }

  /**
   * The insertable commands, recomputed each time the menu opens so newly discovered
   * blocks (pushed by the host after `ready`) appear without a reload. Built-in inserts
   * come first, then discovered blocks.
   */
  private insertCommands(): OmdCommand[] {
    const schema = this.view.state.schema;
    return [...buildCommands(schema).filter((c) => c.insert), ...blockInsertCommands(schema)];
  }

  get isOpen(): boolean {
    return this.el.style.display !== 'none';
  }

  update(state: SlashState): void {
    if (!state.active) {
      this.close();
      return;
    }
    const q = state.query.toLowerCase();
    this.items = this.insertCommands().filter((c) => {
      const hay = [c.title, ...(c.keywords ?? [])].join(' ').toLowerCase();
      return q === '' || hay.includes(q);
    });
    if (this.items.length === 0) {
      this.close();
      return;
    }
    this.selected = Math.min(this.selected, this.items.length - 1);
    this.render(state);
  }

  private render(state: SlashState): void {
    this.el.innerHTML = '';
    let lastGroup = '';
    this.items.forEach((cmd, i) => {
      if (cmd.group && cmd.group !== lastGroup) {
        lastGroup = cmd.group;
        const h = document.createElement('div');
        h.className = 'omd-slash-group';
        h.textContent = cmd.group;
        this.el.appendChild(h);
      }
      const item = document.createElement('div');
      item.className = 'omd-slash-item';
      if (i === this.selected) item.classList.add('omd-slash-item--active');
      if (cmd.icon) item.appendChild(codicon(cmd.icon));
      const label = document.createElement('span');
      label.className = 'omd-slash-label';
      label.textContent = cmd.title;
      item.appendChild(label);
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.choose(i, state);
      });
      item.addEventListener('mouseenter', () => {
        this.selected = i;
        this.highlight();
      });
      this.el.appendChild(item);
    });
    this.position(state);
    this.el.style.display = '';
  }

  private highlight(): void {
    this.el.querySelectorAll('.omd-slash-item').forEach((el, i) => {
      const active = i === this.selected;
      el.classList.toggle('omd-slash-item--active', active);
      // Keep the selection visible as arrow keys walk past the menu's max-height (#slash-scroll).
      if (active) (el as HTMLElement).scrollIntoView({ block: 'nearest' });
    });
  }

  private position(state: SlashState): void {
    const coords = this.view.coordsAtPos(state.from);
    this.el.style.left = `${coords.left}px`;
    this.el.style.top = `${coords.bottom + 4}px`;
  }

  move(delta: number): void {
    if (!this.isOpen) return;
    this.selected = (this.selected + delta + this.items.length) % this.items.length;
    this.highlight();
  }

  choose(index: number, state: SlashState): void {
    const cmd = this.items[index];
    if (!cmd) return;
    const to = this.view.state.selection.from;
    // Remove the `/query`, then run the command against the fresh state.
    this.view.dispatch(this.view.state.tr.delete(state.from, to));
    this.close();
    cmd.run(this.view);
  }

  commit(state: SlashState): void {
    this.choose(this.selected, state);
  }

  close(): void {
    this.el.style.display = 'none';
    this.selected = 0;
  }

  destroy(): void {
    this.el.remove();
  }
}

export const slashPlugin = $prose((ctx) => {
  // Touch the schema ctx so this plugin is ordered after the schema is ready.
  ctx.get(schemaCtx);
  let menu: SlashMenu | null = null;

  return new Plugin<SlashState>({
    key,
    state: {
      init: () => INACTIVE,
      apply: (tr, _prev, _old, newState) => {
        // Recompute from the resulting selection/text; the view sets the real value.
        return key.getState(newState) ?? INACTIVE;
      }
    },
    view: (view) => {
      menu = new SlashMenu(view);
      return {
        update: (v) => {
          const state = readTrigger(v);
          // Stash the computed trigger so keyboard handling can read it.
          (v as unknown as { _omdSlash?: SlashState })._omdSlash = state;
          menu?.update(state);
        },
        destroy: () => menu?.destroy()
      };
    },
    props: {
      handleKeyDown: (view, event) => {
        if (!menu?.isOpen) return false;
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
          case 'Tab': {
            event.preventDefault();
            const state = (view as unknown as { _omdSlash?: SlashState })._omdSlash;
            if (state) menu.choose((menu as unknown as { selected: number }).selected, state);
            return true;
          }
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
