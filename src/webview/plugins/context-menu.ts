import { $prose } from '@milkdown/utils';
import { schemaCtx } from '@milkdown/core';
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { setBlockType } from 'prosemirror-commands';
import { isInTable } from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';
import { buildCommands, type OmdCommand } from '../commands/registry';
import { buildTableCommands } from '../commands/table';
import { blockInsertCommands } from '../blocks/insert';
import { findEditableBlock, openBlockProperties } from '../blocks/edit-properties';
import { startThread } from '../blocks/thread-actions';
import { startRevise, canRevise } from '../blocks/revise';
import { openParamPopover } from '../ui/popover';
import { formatShortcut } from '../ui/shortcut';
import { openContextMenu, closeContextMenu, type MenuEntry } from '../ui/context-menu';

/**
 * The right-click menu is a *discovery surface*: it is always populated, so a reader learns
 * what OMD can do just by right-clicking. It adapts to context — Insert / Turn-into always,
 * formatting + comment on a selection, table ops in a table, Edit-properties on a smart block —
 * and, because taking over the menu means we no longer get VS Code's native one, it owns
 * Cut / Copy / Paste. Every action runs a registry command or a small editor primitive; this
 * file only decides which are relevant (Principle 4).
 */

/** Block-type ids that belong under "Turn into", not "Insert". */
const TURN_INTO_IDS = new Set(['h1', 'h2', 'h3', 'quote', 'bullet-list', 'ordered-list', 'task-list']);

function cmdEntry(cmd: OmdCommand, view: EditorView): MenuEntry {
  return {
    label: cmd.title,
    icon: cmd.icon,
    shortcut: formatShortcut(cmd.shortcut),
    run: () => cmd.run(view)
  };
}

/** New blocks/inline objects to add here (the block-type conversions live under Turn into). */
function insertEntries(view: EditorView): MenuEntry[] {
  const schema = view.state.schema;
  const builtins = buildCommands(schema).filter((c) => c.insert && !TURN_INTO_IDS.has(c.id));
  return [...builtins, ...blockInsertCommands(schema)].map((c) => ({
    label: c.title,
    icon: c.icon,
    run: () => c.run(view)
  }));
}

/** Convert the current block: paragraph / headings / lists / quote. */
function turnIntoEntries(view: EditorView): MenuEntry[] {
  const schema = view.state.schema;
  const byId = new Map(buildCommands(schema).map((c) => [c.id, c]));
  const out: MenuEntry[] = [
    {
      label: 'Paragraph',
      run: () => {
        setBlockType(schema.nodes.paragraph)(view.state, view.dispatch, view);
        view.focus();
      }
    }
  ];
  for (const id of ['h1', 'h2', 'h3', 'quote', 'bullet-list', 'ordered-list', 'task-list']) {
    const c = byId.get(id);
    if (c) out.push({ label: c.title, icon: c.icon, run: () => c.run(view) });
  }
  return out;
}

/** Prompt for a comment body and start a thread on the current selection. */
function promptComment(view: EditorView): void {
  if (view.state.selection.empty) return;
  openParamPopover({
    anchor: view.coordsAtPos(view.state.selection.to),
    label: 'Comment',
    value: '',
    onCommit: (body) => {
      if (body.trim()) startThread(view, body.trim());
    }
  });
}

/** Prompt for an instruction and revise the current selection with AI (inline diff). */
function promptRevise(view: EditorView): void {
  openParamPopover({
    anchor: view.coordsAtPos(view.state.selection.to),
    label: 'Revise with AI',
    value: '',
    onCommit: (instruction) => {
      if (instruction.trim()) startRevise(view, instruction);
    }
  });
}

// --- clipboard (we own it now that the native menu is replaced) ---

function doCopy(view: EditorView): void {
  view.focus();
  document.execCommand('copy');
}
function doCut(view: EditorView): void {
  view.focus();
  document.execCommand('cut');
}
async function doPaste(view: EditorView): Promise<void> {
  view.focus();
  try {
    if (navigator.clipboard?.read) {
      for (const item of await navigator.clipboard.read()) {
        if (item.types.includes('text/html')) {
          view.pasteHTML(await (await item.getType('text/html')).text());
          return;
        }
      }
    }
  } catch {
    /* fall through to plain text */
  }
  try {
    const text = await navigator.clipboard?.readText?.();
    if (text) view.pasteText(text);
  } catch {
    /* clipboard unavailable */
  }
}

/**
 * The entries for the current cursor/selection. Pure over the view's state so it can be
 * asserted directly in tests. Always returns at least Insert + clipboard, so the menu never
 * falls through to VS Code's bare cut/copy/paste.
 */
export function buildMenuEntries(view: EditorView): MenuEntry[] {
  const { state } = view;
  const entries: MenuEntry[] = [{ label: 'Insert', icon: 'add', submenu: insertEntries(view) }];

  if (state.selection.$from.parent.isTextblock && !isInTable(state)) {
    entries.push({ label: 'Turn into', icon: 'symbol-namespace', submenu: turnIntoEntries(view) });
  }

  // Context-specific actions, grouped after the always-present Insert/Turn-into.
  const contextual: MenuEntry[] = [];
  if (!state.selection.empty) {
    const byId = new Map(buildCommands(state.schema).map((c) => [c.id, c]));
    for (const id of ['bold', 'italic', 'code', 'strike', 'link']) {
      const c = byId.get(id);
      if (c) contextual.push(cmdEntry(c, view));
    }
    contextual.push({ label: 'Add comment', icon: 'comment', run: () => promptComment(view) });
    // Revise with AI — only when AI is on (opt-in) and the selection is revisable.
    if (canRevise(view)) {
      contextual.push({ label: 'Revise with AI…', icon: 'sparkle', run: () => promptRevise(view) });
    }
  }
  const block = findEditableBlock(state);
  if (block) {
    if (contextual.length) contextual.push('sep');
    contextual.push({
      label: 'Edit properties…',
      icon: 'settings-gear',
      run: () => openBlockProperties(view, block)
    });
  }
  if (isInTable(state)) {
    const t = new Map(buildTableCommands(state.schema).map((c) => [c.id, c]));
    const group = (ids: string[]): void => {
      if (contextual.length && contextual[contextual.length - 1] !== 'sep') contextual.push('sep');
      for (const id of ids) {
        const c = t.get(id);
        if (c) contextual.push({ label: c.title, icon: c.icon, run: () => c.run(view) });
      }
    };
    group(['table-row-above', 'table-row-below', 'table-col-left', 'table-col-right']);
    group(['table-row-move-up', 'table-row-move-down', 'table-col-move-left', 'table-col-move-right']);
    group(['table-col-sort-asc', 'table-col-sort-desc']);
    group(['table-align-left', 'table-align-center', 'table-align-right']);
    group(['table-row-delete', 'table-col-delete', 'table-delete']);
  }
  if (contextual.length) entries.push('sep', ...contextual);

  entries.push('sep');
  entries.push(
    { label: 'Cut', shortcut: formatShortcut('Mod+X'), run: () => doCut(view) },
    { label: 'Copy', icon: 'copy', shortcut: formatShortcut('Mod+C'), run: () => doCopy(view) },
    { label: 'Paste', shortcut: formatShortcut('Mod+V'), run: () => void doPaste(view) }
  );
  return entries;
}

const key = new PluginKey('omd-context-menu');

export const contextMenuPlugin = $prose((ctx) => {
  ctx.get(schemaCtx); // order after the schema is ready
  return new Plugin({
    key,
    props: {
      handleDOMEvents: {
        contextmenu: (view, event) => {
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (!pos) return false;

          // If the click lands outside the current selection, move the cursor there first so
          // context (table cell, smart block) targets what was clicked. A click inside a live
          // selection keeps it, so formatting acts on what the user highlighted.
          const sel = view.state.selection;
          const inSelection = !sel.empty && pos.pos >= sel.from && pos.pos <= sel.to;
          if (!inSelection) {
            view.dispatch(
              view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos.pos)))
            );
          }

          event.preventDefault();
          openContextMenu({ x: event.clientX, y: event.clientY }, buildMenuEntries(view));
          return true;
        }
      }
    },
    view: () => ({ destroy: () => closeContextMenu() })
  });
});
