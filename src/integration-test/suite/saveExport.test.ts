import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { saveBlockExport } from '../../host/saveExport';

/**
 * The block "save as" write path (blocks/block-actions.ts → `saveAs` message → host). Runs in a
 * real extension host so it exercises the actual `showSaveDialog` + `workspace.fs.writeFile`
 * calls the webview can't reach — a base64 PNG and a utf8 SVG must land on disk byte-exactly,
 * and a cancelled dialog must write nothing.
 */

suite('OMD host: block save-as write path', () => {
  let dir: string;
  let docUri: vscode.Uri;
  const origShowSaveDialog = vscode.window.showSaveDialog;

  suiteSetup(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omd-save-'));
    docUri = vscode.Uri.file(path.join(dir, 'doc.md'));
    fs.writeFileSync(docUri.fsPath, '# Doc\n');
  });

  teardown(() => {
    // Restore the real dialog after any stubbing.
    (vscode.window as unknown as { showSaveDialog: typeof origShowSaveDialog }).showSaveDialog =
      origShowSaveDialog;
  });

  function stubDialog(dest: vscode.Uri | undefined): void {
    (vscode.window as unknown as { showSaveDialog: () => Promise<vscode.Uri | undefined> }).showSaveDialog =
      () => Promise.resolve(dest);
  }

  test('writes a base64 PNG payload byte-for-byte', async () => {
    const dest = vscode.Uri.file(path.join(dir, 'chart.png'));
    stubDialog(dest);
    // 1x1 transparent PNG.
    const b64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const written = await saveBlockExport(docUri, 'chart.png', b64, 'base64');
    assert.ok(written, 'should return the destination');
    const bytes = fs.readFileSync(dest.fsPath);
    assert.deepStrictEqual(bytes, Buffer.from(b64, 'base64'), 'PNG bytes must match the payload');
    assert.strictEqual(bytes[0], 0x89, 'starts with the PNG signature byte');
  });

  test('writes a utf8 SVG payload as text', async () => {
    const dest = vscode.Uri.file(path.join(dir, 'diagram.svg'));
    stubDialog(dest);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
    await saveBlockExport(docUri, 'diagram.svg', svg, 'utf8');
    assert.strictEqual(fs.readFileSync(dest.fsPath, 'utf8'), svg);
  });

  test('writes nothing when the dialog is cancelled', async () => {
    stubDialog(undefined);
    const written = await saveBlockExport(docUri, 'nope.png', 'AAAA', 'base64');
    assert.strictEqual(written, undefined);
    assert.ok(!fs.existsSync(path.join(dir, 'nope.png')), 'no file on cancel');
  });
});
