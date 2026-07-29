import * as assert from 'assert';
import * as vscode from 'vscode';
import { resolveWorkspacePage } from '../../host/wikiResolve';

/**
 * Wikilink click-through resolution against the real fixture wiki. Case-insensitive matching and
 * the space→dash slug can only be exercised on a real filesystem (case sensitivity varies by OS),
 * so it earns a real-host test.
 */
suite('OMD host: wikilink resolution', () => {
  const wiki = (): vscode.Uri => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder, 'the fixture wiki must be the open workspace folder');
    return folder.uri;
  };
  const page = (name: string) => vscode.workspace.openTextDocument(vscode.Uri.joinPath(wiki(), name));
  // Compare the basename case-insensitively: on a case-insensitive filesystem the exact-name `stat`
  // wins first and returns the queried casing; on a case-sensitive one the scan returns the on-disk
  // casing. Either way it points at the same file, which is what click-through opens.
  const base = (uri: vscode.Uri | null) => uri?.path.split('/').pop()?.toLowerCase();

  test('resolves an exact page name', async () => {
    const doc = await page('Alpha.md');
    assert.strictEqual(base(await resolveWorkspacePage(doc, 'Home')), 'home.md');
  });

  test('resolves the space→dash GitHub-wiki slug', async () => {
    const doc = await page('Home.md');
    assert.strictEqual(base(await resolveWorkspacePage(doc, 'Getting Started')), 'getting-started.md');
  });

  test('resolves case-insensitively (lower-case link → mixed-case file)', async () => {
    const doc = await page('Home.md');
    assert.strictEqual(base(await resolveWorkspacePage(doc, 'case test')), 'case-test.md');
    assert.strictEqual(base(await resolveWorkspacePage(doc, 'CASE-TEST')), 'case-test.md');
  });

  test('returns null when no page matches', async () => {
    const doc = await page('Home.md');
    assert.strictEqual(await resolveWorkspacePage(doc, 'No Such Page'), null);
  });
});
