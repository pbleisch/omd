import * as assert from 'assert';
import * as vscode from 'vscode';
import { findBacklinks } from '../../host/backlinks';

/**
 * Backlinks against a real workspace (the fixture wiki opened by runTests). This exercises the
 * actual `workspace.findFiles` scan + `fs.readFile` + the shared matching rules — the path the
 * jsdom tests can only fake. Backlinks were a recurring source of "works in a unit test, not in
 * VS Code" bugs, so they earn a real-host regression here.
 */
suite('OMD host: backlinks across a real workspace', () => {
  let channel: vscode.OutputChannel;
  suiteSetup(() => {
    channel = vscode.window.createOutputChannel('omd-it');
  });
  suiteTeardown(() => channel.dispose());

  const wiki = (): vscode.Uri => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder, 'the fixture wiki must be the open workspace folder');
    return folder.uri;
  };
  const page = (name: string) =>
    vscode.workspace.openTextDocument(vscode.Uri.joinPath(wiki(), name));

  test('finds both wikilink and markdown-link backlinks to a page', async () => {
    const links = await findBacklinks(await page('Home.md'), channel);
    // Alpha, _Sidebar, _Footer link via `[[Home]]`; Beta and Broken via `[…](Home.md)`.
    assert.deepStrictEqual(
      links.map((l) => l.title).sort(),
      ['Alpha', 'Beta', 'Broken', '_Footer', '_Sidebar']
    );
  });

  test('resolves the GitHub space↔dash form ([[Getting Started]] → Getting-Started.md)', async () => {
    const links = await findBacklinks(await page('Getting-Started.md'), channel);
    // Delta links via markdown, _Sidebar via `[[Getting Started]]`.
    assert.deepStrictEqual(
      links.map((l) => l.title).sort(),
      ['Delta', '_Sidebar']
    );
  });

  test('a page nothing links to has no backlinks', async () => {
    const links = await findBacklinks(await page('Beta.md'), channel);
    assert.deepStrictEqual(links, []);
  });
});
