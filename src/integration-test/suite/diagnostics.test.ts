import * as assert from 'assert';
import * as vscode from 'vscode';
import { brokenRelativeLinks } from '../../host/diagnostics';

/**
 * The broken-link filesystem check against a real workspace: `fs.stat` of a relative link target
 * can only be exercised in a real host. A missing target must be reported; an existing sibling must
 * not. (OMD marks these inline in the editor rather than in the Problems panel.)
 */
suite('OMD host: broken-link filesystem check', () => {
  const wiki = (): vscode.Uri => vscode.workspace.workspaceFolders![0].uri;

  test('reports the unresolved relative target, not the existing one', async () => {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(wiki(), 'Broken.md'));
    const broken = await brokenRelativeLinks(doc);
    // Broken.md links to Nope.md (missing) and Home.md (exists) — only the first is broken.
    assert.deepStrictEqual(broken, ['Nope.md']);
  });
});
