import type { EditorView } from 'prosemirror-view';
import { buildCommands, type OmdCommand } from '../commands/registry';
import { blockInsertCommands } from '../blocks/insert';
import { onEditorUpdate } from '../commands/state-events';
import { codicon } from '../codicons';
import { zoomIn, zoomOut, resetZoom, onZoomChange } from './zoom';
import { openFloating, type FloatingHandle } from './floating';
import { attachTooltip } from './tooltip';
import { formatShortcut, MOD_LABEL } from './shortcut';

/**
 * The formatting toolbar: one row of controls, each a thin front-end over a registry
 * command (Principle 4). Buttons reflect the cursor's current marks/block and toggle
 * cleanly (Principle 3). Chrome is codicons; headings use short text labels since there
 * is no heading glyph (docs/design/STYLE.md). Controls are calm — a single quiet bar.
 *
 * Frequent inline/format toggles stay as direct buttons; block/object inserts live behind a
 * single **Insert ▾** dropdown so the bar doesn't crowd. Zoom sits in the normal flow just
 * before Find rather than pinned to the right.
 */
const TOOLBAR_IDS: Array<string | '|'> = [
  'undo',
  'redo',
  '|',
  'bold',
  'italic',
  'code',
  'strike',
  'underline',
  'subscript',
  'superscript',
  '|',
  'h1',
  'h2',
  'h3',
  '|',
  'bullet-list',
  'ordered-list',
  'task-list',
  '|',
  'quote',
  'link',
  '|',
  'insert' // the Insert ▾ dropdown of block/object inserts
  // zoom + find follow as a non-wrapping end group (see mountToolbar), so they stay together and
  // sit right after the buttons rather than pinned far right with a gap.
];

/**
 * The Insert ▾ menu: block/object inserts, in groups (`|` = a divider). Ids resolve against the
 * combined command set (core registry + smart-block inserters), so this is the one place that
 * decides which inserts are promoted to the toolbar — everything still lives in the slash menu too.
 */
const INSERT_MENU_IDS: Array<string | '|'> = [
  'table',
  'code-block',
  'image',
  'divider',
  '|',
  'block-callout',
  'block-2col',
  'block-3col',
  '|',
  'block-chart',
  'block-gallery',
  'block-youtube',
  '|',
  'block-toc',
  'block-collapsible',
  'footnote'
];

export function mountToolbar(container: HTMLElement, view: EditorView): void {
  const schema = view.state.schema;
  // Core commands + smart-block inserters, keyed by id — the Insert menu draws from both.
  const commands = new Map<string, OmdCommand>();
  for (const c of buildCommands(schema)) commands.set(c.id, c);
  for (const c of blockInsertCommands(schema)) commands.set(c.id, c);

  const bar = document.createElement('div');
  bar.className = 'omd-toolbar';
  const main = document.createElement('div');
  main.className = 'omd-toolbar-main';
  bar.appendChild(main);

  const buttons: Array<{ cmd: OmdCommand; el: HTMLButtonElement }> = [];

  const runButton = (cmd: OmdCommand): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'omd-toolbar-btn';
    btn.setAttribute('aria-label', cmd.title);
    attachTooltip(btn, cmd.shortcut ? `${cmd.title} (${formatShortcut(cmd.shortcut)})` : cmd.title);
    if (cmd.icon) btn.appendChild(codicon(cmd.icon));
    else {
      btn.classList.add('omd-toolbar-btn--text');
      btn.textContent = cmd.label ?? cmd.title;
    }
    // mousedown + preventDefault keeps the editor selection while clicking the button.
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      cmd.run(view);
    });
    return btn;
  };

  const addSep = (parent: HTMLElement) => {
    const sep = document.createElement('span');
    sep.className = 'omd-toolbar-sep';
    parent.appendChild(sep);
  };

  for (const id of TOOLBAR_IDS) {
    if (id === '|') {
      addSep(main);
      continue;
    }
    if (id === 'insert') {
      main.appendChild(buildInsertButton(view, commands));
      continue;
    }
    const cmd = commands.get(id);
    if (!cmd) continue;
    const btn = runButton(cmd);
    main.appendChild(btn);
    buttons.push({ cmd, el: btn });
  }

  // Zoom + Find as one non-wrapping end group — flows right after the buttons (no pinned gap) and,
  // if the bar is tight, wraps together to the next row instead of stranding Find on its own.
  const end = document.createElement('span');
  end.className = 'omd-toolbar-end';
  addSep(end);
  mountZoomControls(end);
  const find = commands.get('find');
  if (find) {
    addSep(end);
    const btn = runButton(find);
    end.appendChild(btn);
    buttons.push({ cmd: find, el: btn });
  }
  main.appendChild(end);

  container.appendChild(bar);

  const refresh = (v: EditorView) => {
    for (const { cmd, el } of buttons) {
      const active = cmd.isActive?.(v.state) ?? false;
      el.classList.toggle('omd-toolbar-btn--active', active);
    }
  };
  refresh(view);
  onEditorUpdate(refresh);
}

/** The "Insert ▾" button + its dropdown of block/object inserts. Exactly one menu open at a time. */
function buildInsertButton(view: EditorView, commands: Map<string, OmdCommand>): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'omd-toolbar-btn omd-toolbar-btn--text omd-toolbar-insert';
  btn.setAttribute('aria-label', 'Insert');
  attachTooltip(btn, 'Insert a block');
  const label = document.createElement('span');
  label.textContent = 'Insert';
  btn.append(label, codicon('chevron-down'));

  let menu: FloatingHandle | null = null;
  const closeMenu = () => {
    menu?.close();
    menu = null;
    btn.classList.remove('omd-toolbar-btn--active');
  };

  btn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (menu) {
      closeMenu();
      return;
    }
    const content = buildInsertMenu(view, commands, () => closeMenu());
    const r = btn.getBoundingClientRect();
    btn.classList.add('omd-toolbar-btn--active');
    menu = openFloating({
      anchor: { left: r.left, top: r.top, bottom: r.bottom },
      content,
      className: 'omd-insert-menu-layer',
      onDismiss: () => {
        menu = null;
        btn.classList.remove('omd-toolbar-btn--active');
      }
    });
  });

  return btn;
}

/** The dropdown body — one row per insert, grouped by the `|` dividers in `INSERT_MENU_IDS`. */
function buildInsertMenu(
  view: EditorView,
  commands: Map<string, OmdCommand>,
  close: () => void
): HTMLElement {
  const menu = document.createElement('div');
  menu.className = 'omd-insert-menu';

  let pendingSep = false;
  for (const id of INSERT_MENU_IDS) {
    if (id === '|') {
      pendingSep = true;
      continue;
    }
    const cmd = commands.get(id);
    if (!cmd) continue;
    if (pendingSep && menu.childElementCount > 0) {
      const sep = document.createElement('div');
      sep.className = 'omd-insert-menu-sep';
      menu.appendChild(sep);
    }
    pendingSep = false;

    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'omd-slash-item omd-insert-item';
    if (cmd.icon) item.appendChild(codicon(cmd.icon));
    const text = document.createElement('span');
    text.className = 'omd-slash-label';
    text.textContent = cmd.title;
    item.appendChild(text);
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      close();
      cmd.run(view);
    });
    menu.appendChild(item);
  }
  return menu;
}

/** The zoom segment: out / a clickable %-label (reset) / in, appended into the toolbar flow. */
function mountZoomControls(bar: HTMLElement): void {
  const iconBtn = (icon: string, title: string, onClick: () => void): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'omd-toolbar-btn';
    btn.setAttribute('aria-label', title);
    attachTooltip(btn, title);
    btn.appendChild(codicon(icon));
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onClick();
    });
    return btn;
  };

  bar.appendChild(iconBtn('zoom-out', `Zoom out (${MOD_LABEL} -)`, zoomOut));

  const label = document.createElement('button');
  label.type = 'button';
  label.className = 'omd-toolbar-btn omd-toolbar-btn--text omd-zoom-label';
  label.setAttribute('aria-label', 'Reset zoom');
  attachTooltip(label, `Reset zoom (${MOD_LABEL} 0)`);
  label.addEventListener('mousedown', (e) => {
    e.preventDefault();
    resetZoom();
  });
  onZoomChange((z) => {
    label.textContent = `${z}%`;
  });
  bar.appendChild(label);

  bar.appendChild(iconBtn('zoom-in', `Zoom in (${MOD_LABEL} +)`, zoomIn));

  // Cmd/Ctrl +/-/0 zoom the document (buttons are the reliable path if VS Code eats these).
  document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    if (e.key === '=' || e.key === '+') {
      e.preventDefault();
      zoomIn();
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      zoomOut();
    } else if (e.key === '0') {
      e.preventDefault();
      resetZoom();
    }
  });
}
