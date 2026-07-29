import { $prose } from '@milkdown/utils';
import { schemaCtx } from '@milkdown/core';
import { keymap } from 'prosemirror-keymap';
import type { Command } from 'prosemirror-state';
import { buildCommands } from './registry';

/**
 * Binds each command's `key` to its `run`, so a shortcut drives exactly the same code
 * as the toolbar and slash menu (Principle 4). Built from the same registry (via the
 * editor's schema) — there is no separate shortcut implementation to drift out of sync.
 */
export const omdKeymap = $prose((ctx) => {
  const schema = ctx.get(schemaCtx);
  const commands = buildCommands(schema);
  const bindings: Record<string, Command> = {};
  for (const cmd of commands) {
    if (!cmd.key) continue;
    bindings[cmd.key] = (_state, _dispatch, view) => (view ? cmd.run(view) : false);
  }
  return keymap(bindings);
});
