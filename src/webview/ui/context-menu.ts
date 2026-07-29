import { codicon } from '../codicons';
import { openFloating, type FloatingHandle } from './floating';

/**
 * The one context-menu surface. A generic, node-aware menu built on the floating primitive:
 * callers hand it a point and a list of entries, it renders rows + separators + submenus and
 * runs the chosen action. It knows nothing about the editor — entries are assembled by the
 * context-menu plugin, keeping this a thin renderer.
 *
 * Submenus are rendered as children of the root floating element (not separate layers), so the
 * floating layer's outside-click check still treats a click on a submenu item as "inside".
 */

export interface MenuItem {
  label: string;
  /** Leaf action. Omit when the item only opens a `submenu`. */
  run?: () => void;
  /** A nested menu opened on hover; renders a ▸ affordance. */
  submenu?: MenuEntry[];
  /** Optional right-aligned shortcut hint, e.g. "⌘B". */
  shortcut?: string;
  /** Codicon name shown at the left. */
  icon?: string;
  /** Rendered dimmed and non-interactive. */
  disabled?: boolean;
}

export type MenuEntry = MenuItem | 'sep';

let current: FloatingHandle | null = null;
/** Open submenu elements, indexed by the depth of their parent row (0 = root's submenus). */
let openSubs: HTMLElement[] = [];

export function closeContextMenu(): void {
  for (const s of openSubs) s.remove();
  openSubs = [];
  current?.close();
  current = null;
}

function iconEl(name: string): HTMLElement {
  const el = codicon(name);
  el.classList.add('omd-context-menu-icon');
  return el;
}

/** Close every open submenu at `depth` or deeper. */
function closeSubsFrom(depth: number): void {
  while (openSubs.length > depth) openSubs.pop()?.remove();
}

function buildMenu(entries: MenuEntry[], depth: number): HTMLElement {
  const menu = document.createElement('div');
  menu.className = 'omd-context-menu';
  menu.setAttribute('role', 'menu');

  for (const entry of entries) {
    if (entry === 'sep') {
      const sep = document.createElement('div');
      sep.className = 'omd-context-menu-sep';
      menu.appendChild(sep);
      continue;
    }
    const row = document.createElement('div');
    row.className = 'omd-context-menu-item';
    row.setAttribute('role', 'menuitem');
    if (entry.disabled) row.classList.add('omd-context-menu-item--disabled');

    row.appendChild(entry.icon ? iconEl(entry.icon) : iconEl('blank'));

    const label = document.createElement('span');
    label.className = 'omd-context-menu-label';
    label.textContent = entry.label;
    row.appendChild(label);

    if (entry.submenu) {
      const chevron = codicon('chevron-right');
      chevron.classList.add('omd-context-menu-chevron');
      row.appendChild(chevron);
    } else if (entry.shortcut) {
      const sc = document.createElement('span');
      sc.className = 'omd-context-menu-shortcut';
      sc.textContent = entry.shortcut;
      row.appendChild(sc);
    }

    if (!entry.disabled) {
      const sub = entry.submenu;
      if (sub) {
        row.addEventListener('mouseenter', () => openSubmenu(row, sub, depth));
        // Clicking a submenu parent just opens it, never dismisses.
        row.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          openSubmenu(row, sub, depth);
        });
      } else {
        row.addEventListener('mouseenter', () => closeSubsFrom(depth));
        // mousedown (not click) so the editor selection is preserved when the action runs.
        row.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          closeContextMenu();
          entry.run?.();
        });
      }
    }
    menu.appendChild(row);
  }
  return menu;
}

/** Position `sub` to the right of `row`, flipping to the left / clamping up when it would clip. */
function placeSubmenu(sub: HTMLElement, row: HTMLElement): void {
  const r = row.getBoundingClientRect();
  const vw = window.innerWidth || 0;
  const vh = window.innerHeight || 0;
  const w = sub.getBoundingClientRect().width || sub.offsetWidth || 0;
  const h = sub.getBoundingClientRect().height || sub.offsetHeight || 0;
  let left = r.right - 2;
  if (vw > 0 && left + w > vw) left = Math.max(4, r.left - w + 2);
  let top = r.top - 4;
  if (vh > 0 && top + h > vh) top = Math.max(4, vh - h - 4);
  sub.style.left = `${Math.round(left)}px`;
  sub.style.top = `${Math.round(top)}px`;
}

function openSubmenu(row: HTMLElement, entries: MenuEntry[], depth: number): void {
  closeSubsFrom(depth);
  if (!current) return;
  const sub = buildMenu(entries, depth + 1);
  sub.style.position = 'fixed';
  sub.style.zIndex = '31'; // above the parent menu
  current.el.appendChild(sub); // inside the root floating el → counts as "inside" for dismissal
  openSubs[depth] = sub;
  placeSubmenu(sub, row);
}

export function openContextMenu(at: { x: number; y: number }, entries: MenuEntry[]): void {
  closeContextMenu();
  current = openFloating({
    anchor: { left: at.x, top: at.y, bottom: at.y },
    content: buildMenu(entries, 0),
    offset: 0,
    onDismiss: () => {
      for (const s of openSubs) s.remove();
      openSubs = [];
      current = null;
    }
  });
}
