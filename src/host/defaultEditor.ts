import * as vscode from 'vscode';
import {
  MARKDOWN_GLOB,
  isDefaultFor,
  readAssociations,
  withMarkdownAssociation,
  withoutMarkdownAssociation,
  type EditorAssociations
} from './editorAssociations';

/**
 * "Make OMD the default Markdown editor" — and its inverse.
 *
 * OMD ships at `priority: "option"`, so installing it takes nothing over: a fresh install leaves
 * `.md` opening in whatever opened it before. Becoming the default is a deliberate act, and these
 * two commands are it. `omd.openWith` / `omd.reopenAsText` stay the per-file try-before-you-commit
 * path; these change the standing preference.
 *
 * The mechanism is `workbench.editorAssociations` — the setting VS Code's editor resolver checks
 * before registered priority. Two rules govern every write here:
 *
 *   1. **Merge, never clobber.** The setting is the user's map and may hold their entries for other
 *      file types. We read the *global* value, change only the `*.md` key, and write it back.
 *      Reading the *effective* (merged) value would copy workspace entries into user settings.
 *   2. **Global scope only.** "Open markdown in OMD" is a machine-level preference, not a property
 *      of one project. Writing at workspace scope would also mean editing a checked-in
 *      `.vscode/settings.json` on the user's behalf.
 */

const SETTING = 'workbench.editorAssociations';

/** The global (user-level) value of the setting, plus the workspace value that can shadow it. */
function inspectAssociations(): { global: EditorAssociations; workspace: EditorAssociations } {
  const inspected = vscode.workspace.getConfiguration().inspect<unknown>(SETTING);
  return {
    global: readAssociations(inspected?.globalValue),
    workspace: readAssociations(inspected?.workspaceValue)
  };
}

async function writeGlobal(next: EditorAssociations): Promise<void> {
  // `undefined` removes the setting entirely rather than leaving `"workbench.editorAssociations": {}`
  // behind in settings.json — undoing an opt-in should leave no trace when there is nothing else there.
  const value = Object.keys(next).length === 0 ? undefined : next;
  await vscode.workspace.getConfiguration().update(SETTING, value, vscode.ConfigurationTarget.Global);
}

/**
 * A workspace-scope `*.md` association wins over the user-scope one (VS Code applies user entries
 * only where the workspace map has no key), so a global opt-in can be silently inert. Say so rather
 * than claiming a change that will not be visible in this window.
 */
function shadowedBy(workspace: EditorAssociations, viewType: string): string | undefined {
  const shadow = workspace[MARKDOWN_GLOB];
  return shadow && shadow !== viewType ? shadow : undefined;
}

/**
 * One unobtrusive notification, always carrying the way back out. Nothing here blocks: the promise
 * from `showInformationMessage` is deliberately not awaited by the caller's critical path.
 */
function confirm(message: string, action: string, command: string): void {
  void vscode.window.showInformationMessage(message, action).then((picked) => {
    if (picked === action) void vscode.commands.executeCommand(command);
  });
}

/**
 * Point `*.md` at OMD in the user's global settings. Idempotent: running it when OMD is already the
 * default says so instead of rewriting the setting.
 */
export async function makeDefaultEditor(viewType: string, log: vscode.OutputChannel): Promise<void> {
  const { global, workspace } = inspectAssociations();

  if (isDefaultFor(global, viewType)) {
    log.appendLine(`default editor: ${MARKDOWN_GLOB} already associated with ${viewType}`);
    confirm(
      'OMD is already the default editor for Markdown.',
      'Undo',
      'omd.restoreDefaultEditor'
    );
    return;
  }

  await writeGlobal(withMarkdownAssociation(global, viewType));
  log.appendLine(`default editor: associated ${MARKDOWN_GLOB} with ${viewType} (global)`);

  const shadow = shadowedBy(workspace, viewType);
  if (shadow) {
    confirm(
      `OMD is now your default Markdown editor, but this workspace overrides \`${MARKDOWN_GLOB}\` to "${shadow}" — remove that from the workspace settings for it to take effect here.`,
      'Undo',
      'omd.restoreDefaultEditor'
    );
    return;
  }

  confirm(
    'OMD is now the default editor for Markdown. Files already open keep their current editor until reopened.',
    'Undo',
    'omd.restoreDefaultEditor'
  );
}

/**
 * Drop the `*.md` association, handing markdown back to the built-in editor. Idempotent: running it
 * when OMD is not the default reports that plainly and writes nothing.
 */
export async function restoreDefaultEditor(viewType: string, log: vscode.OutputChannel): Promise<void> {
  const { global } = inspectAssociations();

  if (!isDefaultFor(global, viewType)) {
    log.appendLine(`default editor: ${MARKDOWN_GLOB} is not associated with ${viewType}; nothing to restore`);
    confirm(
      'OMD is not the default editor for Markdown — nothing to change.',
      'Make OMD the default',
      'omd.makeDefaultEditor'
    );
    return;
  }

  await writeGlobal(withoutMarkdownAssociation(global));
  log.appendLine(`default editor: removed the ${MARKDOWN_GLOB} association (global)`);

  confirm(
    'Markdown is back to the built-in editor. Files already open keep their current editor until reopened.',
    'Make OMD the default',
    'omd.makeDefaultEditor'
  );
}
