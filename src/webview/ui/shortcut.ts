/**
 * Format a keymap shortcut for display, platform-aware. Keymaps are written with "Mod" (the
 * primary modifier); this renders it as ⌘/⇧/⌥ on macOS and Ctrl/Shift/Alt elsewhere — so a
 * tooltip shows "⌘B" on a Mac and "Ctrl+B" on Windows/Linux. One helper, used by the toolbar
 * and the context menu, so the two never drift.
 */
const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

/** The primary-modifier word/symbol on its own (⌘ on macOS, Ctrl elsewhere). */
export const MOD_LABEL = isMac ? '⌘' : 'Ctrl';

/** "Mod+Shift+X" → "⇧⌘X" on macOS, "Ctrl+Shift+X" elsewhere. */
export function formatShortcut(shortcut: string | undefined): string | undefined {
  if (!shortcut) return undefined;
  return shortcut
    .replace(/Mod/g, isMac ? '⌘' : 'Ctrl')
    .replace(/Shift/g, isMac ? '⇧' : 'Shift')
    .replace(/Alt/g, isMac ? '⌥' : 'Alt')
    .replace(/\+/g, isMac ? '' : '+');
}
