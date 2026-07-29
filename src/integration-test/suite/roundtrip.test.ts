import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Host-side round-trip / dirty-state regression tests (bug #14). Two things must hold:
 *   1. Opening a markdown file in the OMD editor must not mark it modified.
 *   2. An external change to a *clean* file must reload into the editor without dirtying it
 *      (a dirty buffer is what stops VS Code auto-reverting — the "doesn't reload" symptom).
 *
 * Runs inside a real extension host, exercising the actual open → webview → serialize → echo
 * → applyEdit path the jsdom tests can't reach.
 */

const SAMPLE = [
  '# Title',
  '',
  '- [x] done item',
  '- [ ] todo item',
  '  - nested note',
  '',
  'A paragraph with **bold**, _italic_, and `code`.',
  '',
  '> [!NOTE]',
  '> A callout.',
  '',
  '  <br />',
  ''
].join('\n');

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Wait until the doc's text equals `expected` (or time out), so we don't race the reload. */
async function waitForText(doc: vscode.TextDocument, expected: string, ms: number): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (doc.getText() === expected) return;
    await wait(200);
  }
}

suite('OMD host: open + external reload must not dirty the document (#14)', () => {
  let file: string;
  let uri: vscode.Uri;

  suiteSetup(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omd-it-'));
    file = path.join(dir, 'sample.md');
    fs.writeFileSync(file, SAMPLE);
    uri = vscode.Uri.file(file);
  });

  test('opening in the OMD editor leaves the buffer clean and unchanged', async () => {
    await vscode.commands.executeCommand('vscode.openWith', uri, 'omd.editor');
    const doc = await vscode.workspace.openTextDocument(uri);
    await wait(5000); // let the webview load, render, and (if buggy) echo an edit back

    assert.strictEqual(doc.isDirty, false, 'opening should not mark the document dirty');
    assert.strictEqual(doc.getText(), SAMPLE, 'opening should not change the document text');
  });

  test('an external change to a clean file reloads without dirtying', async () => {
    const doc = await vscode.workspace.openTextDocument(uri);
    assert.strictEqual(doc.isDirty, false, 'precondition: buffer is clean before the external edit');

    const changed = SAMPLE + '\nAdded by an external process.\n';
    fs.writeFileSync(file, changed); // external modification, mirroring the live BUGS.md test

    await waitForText(doc, changed, 8000); // VS Code should auto-revert the clean buffer
    assert.strictEqual(doc.getText(), changed, 'editor should reflect the external change (reload)');

    // The reload re-pushes to the webview, whose markdownUpdated is debounced 200ms — the echo
    // that used to dirty the buffer fires *after* the revert. Wait past it before asserting.
    await wait(1000);
    assert.strictEqual(doc.isDirty, false, 'external reload should not leave the buffer dirty');
    assert.strictEqual(doc.getText(), changed, 'reload content should stay put (no echo overwrite)');
  });

  suiteTeardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });
});
