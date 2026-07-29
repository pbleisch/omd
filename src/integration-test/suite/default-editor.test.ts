import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * The default-markdown-editor opt-in, end to end in a real extension host.
 *
 * OMD registers its custom editor at `priority: "option"`, so a fresh install must leave `.md`
 * opening in the built-in editor. `OMD: Make OMD the default Markdown editor` writes a `*.md` entry
 * into the user's `workbench.editorAssociations`; the inverse command removes it. What matters and
 * cannot be checked outside a host:
 *
 *   - which editor actually opens a `.md` before, during, and after the opt-in;
 *   - that the write lands at **global** scope and merges into the user's existing map;
 *   - that both commands are registered and safe to run twice.
 *
 * This suite writes to global settings, which is why the runner uses a throwaway `--user-data-dir`
 * (`runTests.ts`). It still restores whatever it found, so a run leaves no state behind.
 */

const SETTING = 'workbench.editorAssociations';
const OMD_VIEW_TYPE = 'omd.editor';
const MARKDOWN_GLOB = '*.md';

/** An unrelated entry that must survive both commands untouched. */
const UNRELATED = { '*.hex': 'hexEditor.hexedit', '*.svg': 'svgPreviewer.customEditor' } as const;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function globalAssociations(): Record<string, string> {
  const inspected = vscode.workspace.getConfiguration().inspect<Record<string, string>>(SETTING);
  return { ...(inspected?.globalValue ?? {}) };
}

async function setGlobalAssociations(value: Record<string, string> | undefined): Promise<void> {
  await vscode.workspace.getConfiguration().update(SETTING, value, vscode.ConfigurationTarget.Global);
}

/** Assert the user's own entries came through whatever we just did. */
function assertUnrelatedSurvived(where: string): void {
  const current = globalAssociations();
  for (const [glob, viewType] of Object.entries(UNRELATED)) {
    assert.strictEqual(current[glob], viewType, `${where}: clobbered the user's ${glob} association`);
  }
}

/**
 * Open a URI the way a user would — letting VS Code's editor resolver choose — and report the view
 * type of the resulting tab. A custom editor tab carries `TabInputCustom` with its `viewType`; the
 * built-in text editor yields `TabInputText`, reported here as `'default'` to match the spelling
 * `workbench.editorAssociations` uses for it.
 */
async function openAndIdentify(uri: vscode.Uri): Promise<string> {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  await vscode.commands.executeCommand('vscode.open', uri);
  // Give the resolver + custom editor a beat to settle before reading the tab.
  const deadline = Date.now() + 15_000;
  let seen = 'none';
  while (Date.now() < deadline) {
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    if (tab?.input instanceof vscode.TabInputCustom) {
      seen = tab.input.viewType;
      if (seen === OMD_VIEW_TYPE) return seen;
    } else if (tab?.input instanceof vscode.TabInputText) {
      seen = 'default';
      return seen;
    }
    await wait(200);
  }
  return seen;
}

suite('OMD host: "make OMD the default Markdown editor" is opt-in and reversible', () => {
  let uri: vscode.Uri;
  let priorGlobal: Record<string, string> | undefined;

  suiteSetup(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omd-default-editor-'));
    const file = path.join(dir, 'note.md');
    fs.writeFileSync(file, '# Note\n\nA paragraph.\n');
    uri = vscode.Uri.file(file);

    priorGlobal = vscode.workspace.getConfiguration().inspect<Record<string, string>>(SETTING)?.globalValue;
    // Seed the user's own associations so every assertion below is also a merge assertion.
    await setGlobalAssociations({ ...UNRELATED });
    await wait(500);
  });

  suiteTeardown(async () => {
    await setGlobalAssociations(priorGlobal);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  test('both commands are registered and reachable from the Command Palette', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('omd.makeDefaultEditor'), 'omd.makeDefaultEditor is not registered');
    assert.ok(commands.includes('omd.restoreDefaultEditor'), 'omd.restoreDefaultEditor is not registered');
    // The per-file escape hatches are unchanged by the opt-in work.
    assert.ok(commands.includes('omd.openWith'));
    assert.ok(commands.includes('omd.reopenAsText'));
  });

  test('with no association, a .md opens in the built-in editor (the fresh-install state)', async () => {
    assert.strictEqual(globalAssociations()[MARKDOWN_GLOB], undefined, 'precondition: no *.md association');
    assert.strictEqual(await openAndIdentify(uri), 'default');
  });

  test('omd.openWith still opens that same file in OMD without changing the default', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.commands.executeCommand('omd.openWith', uri);
    await wait(3000);
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    assert.ok(tab?.input instanceof vscode.TabInputCustom, 'omd.openWith did not open a custom editor');
    assert.strictEqual((tab.input as vscode.TabInputCustom).viewType, OMD_VIEW_TYPE);
    assert.strictEqual(globalAssociations()[MARKDOWN_GLOB], undefined, 'try-before-you-commit must not set a default');
  });

  test('the opt-in command writes *.md at global scope, merging into the user map', async () => {
    await vscode.commands.executeCommand('omd.makeDefaultEditor');
    await wait(1000);

    assert.strictEqual(globalAssociations()[MARKDOWN_GLOB], OMD_VIEW_TYPE);
    assertUnrelatedSurvived('after opt-in');

    // Global scope, not workspace: the integration run opens a workspace folder, so a stray
    // workspace write would show up here.
    const inspected = vscode.workspace.getConfiguration().inspect<Record<string, string>>(SETTING);
    assert.strictEqual(
      inspected?.workspaceValue?.[MARKDOWN_GLOB],
      undefined,
      'the opt-in must not write workspace settings'
    );
  });

  test('after opting in, a plain open of a .md lands in OMD', async () => {
    assert.strictEqual(await openAndIdentify(uri), OMD_VIEW_TYPE);
  });

  test('running the opt-in again is a harmless no-op', async () => {
    const before = JSON.stringify(globalAssociations());
    await vscode.commands.executeCommand('omd.makeDefaultEditor');
    await wait(1000);
    assert.strictEqual(JSON.stringify(globalAssociations()), before, 'a second opt-in changed the setting');
    assertUnrelatedSurvived('after a repeated opt-in');
  });

  test('omd.reopenAsText still escapes to plain text while OMD is the default', async () => {
    await openAndIdentify(uri);
    await vscode.commands.executeCommand('omd.reopenAsText', uri);
    await wait(3000);
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    assert.ok(tab?.input instanceof vscode.TabInputText, 'reopenAsText did not reach the text editor');
  });

  test('the inverse command removes only the markdown entry', async () => {
    await vscode.commands.executeCommand('omd.restoreDefaultEditor');
    await wait(1000);

    assert.strictEqual(globalAssociations()[MARKDOWN_GLOB], undefined, '*.md association was not removed');
    assertUnrelatedSurvived('after restore');
  });

  test('after the inverse command, a .md opens in the built-in editor again', async () => {
    assert.strictEqual(await openAndIdentify(uri), 'default');
  });

  test('running the inverse command when OMD is not the default is a harmless no-op', async () => {
    const before = JSON.stringify(globalAssociations());
    await vscode.commands.executeCommand('omd.restoreDefaultEditor');
    await wait(1000);
    assert.strictEqual(JSON.stringify(globalAssociations()), before, 'a redundant restore changed the setting');
    assertUnrelatedSurvived('after a redundant restore');
  });

  test('the opt-in leaves no empty setting object behind when the user had nothing else', async () => {
    await setGlobalAssociations(undefined);
    await wait(500);
    await vscode.commands.executeCommand('omd.makeDefaultEditor');
    await wait(1000);
    assert.deepStrictEqual(globalAssociations(), { [MARKDOWN_GLOB]: OMD_VIEW_TYPE });

    await vscode.commands.executeCommand('omd.restoreDefaultEditor');
    await wait(1000);
    const inspected = vscode.workspace.getConfiguration().inspect<Record<string, string>>(SETTING);
    assert.strictEqual(inspected?.globalValue, undefined, 'undoing the opt-in should leave no trace');

    await setGlobalAssociations({ ...UNRELATED });
    await wait(500);
  });

  test('both commands work with no markdown file open', async () => {
    // Not a cold-start test — the host is already activated by this point — but it does prove the
    // commands do not depend on an active editor or a `.md` in the workspace.
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await wait(500);
    assert.strictEqual(vscode.window.tabGroups.activeTabGroup.activeTab, undefined, 'expected no open tab');

    await vscode.commands.executeCommand('omd.makeDefaultEditor');
    await wait(1000);
    assert.strictEqual(globalAssociations()[MARKDOWN_GLOB], OMD_VIEW_TYPE);

    await vscode.commands.executeCommand('omd.restoreDefaultEditor');
    await wait(1000);
    assert.strictEqual(globalAssociations()[MARKDOWN_GLOB], undefined);
    assertUnrelatedSurvived('after invoking both with no editor open');
  });
});
