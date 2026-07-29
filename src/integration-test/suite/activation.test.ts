import * as assert from 'assert';
import * as vscode from 'vscode';

/**
 * Cold activation of the default-editor opt-in.
 *
 * `activationEvents` in `package.json` is empty on purpose: since VS Code 1.74 a command in
 * `contributes.commands` carries its own implicit activation event, and OMD's `engines.vscode` is
 * `^1.90.0`. But "the extension activates when you run the command" is exactly the kind of claim
 * that quietly stops being true — and for the opt-in command it is the *whole* path a new user
 * takes: fresh install, nothing open, Command Palette. Before this change OMD was registered at
 * `priority: "default"`, so a `.md` opening was always there to activate it first. It isn't anymore.
 *
 * This suite must run first (see the sort in `index.ts`) — it asserts the extension has not been
 * activated yet, which no later suite can honestly claim.
 */

const EXTENSION_ID = 'pbleisch.omd';
const SETTING = 'workbench.editorAssociations';
const MARKDOWN_GLOB = '*.md';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

suite('OMD host: the opt-in command activates the extension from cold', () => {
  let priorGlobal: Record<string, string> | undefined;

  suiteSetup(() => {
    priorGlobal = vscode.workspace.getConfiguration().inspect<Record<string, string>>(SETTING)?.globalValue;
  });

  suiteTeardown(async () => {
    await vscode.workspace
      .getConfiguration()
      .update(SETTING, priorGlobal, vscode.ConfigurationTarget.Global);
  });

  test('running omd.makeDefaultEditor with nothing open activates OMD and writes the association', async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `${EXTENSION_ID} is not installed in the test host`);
    assert.strictEqual(
      extension.isActive,
      false,
      'precondition: OMD must still be dormant — has an earlier suite activated it?'
    );

    // No editor open, no `.md` anywhere near the command. This is the new-user path.
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.commands.executeCommand('omd.makeDefaultEditor');
    await wait(1000);

    assert.strictEqual(extension.isActive, true, 'invoking the command did not activate the extension');
    const associations = vscode.workspace.getConfiguration().inspect<Record<string, string>>(SETTING);
    assert.strictEqual(
      associations?.globalValue?.[MARKDOWN_GLOB],
      'omd.editor',
      'the command activated but did not write the association'
    );
  });

  test('the inverse command also works from that state', async () => {
    await vscode.commands.executeCommand('omd.restoreDefaultEditor');
    await wait(1000);
    const associations = vscode.workspace.getConfiguration().inspect<Record<string, string>>(SETTING);
    assert.strictEqual(associations?.globalValue?.[MARKDOWN_GLOB], undefined);
  });
});
