import * as assert from 'assert';
import * as vscode from 'vscode';
import { resolveDocumentLink, headingLine } from '../../host/linkResolve';
import { resolveWorkspacePage } from '../../host/wikiResolve';

/**
 * Ordinary markdown link resolution against the real fixture workspace. A markdown link resolves
 * relative to the document holding it, which only a real filesystem can prove: the cases that
 * matter (a subdirectory sibling, `../`, a spaced/percent-encoded name, a non-markdown target)
 * are exactly the ones the wikilink resolver gets wrong, and a stub would just re-state the code.
 */
suite('OMD host: markdown link resolution', () => {
  const wiki = (): vscode.Uri => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder, 'the fixture wiki must be the open workspace folder');
    return folder.uri;
  };
  const page = (name: string) => vscode.workspace.openTextDocument(vscode.Uri.joinPath(wiki(), name));
  /** The resolved path, relative to the workspace, so assertions read like the links do. */
  const rel = (found: { uri: vscode.Uri } | null) =>
    found ? vscode.workspace.asRelativePath(found.uri, false) : null;

  test('resolves a sibling of the document, not of the workspace root', async () => {
    const doc = await page('docs/Design.md');
    assert.strictEqual(rel(await resolveDocumentLink(doc, 'Nested.md')), 'docs/Nested.md');
  });

  test('resolves a path below the document', async () => {
    const doc = await page('Home.md');
    assert.strictEqual(rel(await resolveDocumentLink(doc, 'docs/Design.md')), 'docs/Design.md');
  });

  test('resolves upward through ../', async () => {
    const doc = await page('docs/Design.md');
    assert.strictEqual(rel(await resolveDocumentLink(doc, '../Home.md')), 'Home.md');
    assert.strictEqual(
      rel(await resolveDocumentLink(doc, '../assets/notes.txt')),
      'assets/notes.txt'
    );
  });

  test('a leading / is workspace-folder-relative', async () => {
    const doc = await page('docs/Design.md');
    assert.strictEqual(rel(await resolveDocumentLink(doc, '/Home.md')), 'Home.md');
  });

  test('resolves a percent-encoded and a literally-spaced name to the same file', async () => {
    const doc = await page('docs/Design.md');
    assert.strictEqual(rel(await resolveDocumentLink(doc, 'my%20doc.md')), 'docs/my doc.md');
    assert.strictEqual(rel(await resolveDocumentLink(doc, 'my doc.md')), 'docs/my doc.md');
  });

  test('resolves a non-markdown target — any file type is followable', async () => {
    const doc = await page('Home.md');
    assert.strictEqual(rel(await resolveDocumentLink(doc, 'assets/notes.txt')), 'assets/notes.txt');
  });

  test('resolves an explicit file URI', async () => {
    const doc = await page('Home.md');
    const notes = vscode.Uri.joinPath(wiki(), 'assets/notes.txt');
    assert.strictEqual(rel(await resolveDocumentLink(doc, notes.toString())), 'assets/notes.txt');
  });

  test('keeps the anchor with the resolved file', async () => {
    const doc = await page('Home.md');
    const found = await resolveDocumentLink(doc, 'docs/Design.md#the-cli');
    assert.strictEqual(rel(found), 'docs/Design.md');
    assert.strictEqual(found?.fragment, 'the-cli');
  });

  test('returns null when the file is not there', async () => {
    const doc = await page('docs/Design.md');
    assert.strictEqual(await resolveDocumentLink(doc, 'Nope.md'), null);
    assert.strictEqual(await resolveDocumentLink(doc, '../Nope.md'), null);
  });

  test('a bare anchor never resolves to a file — the editor scrolls itself', async () => {
    const doc = await page('Home.md');
    assert.strictEqual(await resolveDocumentLink(doc, '#the-cli'), null);
  });

  /**
   * The bug that started this: markdown links used to go through `resolveWorkspacePage`, which is
   * *wikilink* resolution — a page-name search. From a subdirectory the two rules disagree, and the
   * wikilink one invents a destination for a link markdown says is broken. Guards against the two
   * being merged back together.
   */
  test('the wikilink rule and the markdown rule are not interchangeable', async () => {
    const doc = await page('docs/Design.md');
    // `[a](Home.md)` written in docs/ means docs/Home.md, which does not exist.
    assert.strictEqual(await resolveDocumentLink(doc, 'Home.md'), null);
    // The wikilink search finds the root Home.md anyway — right for `[[Home]]`, wrong here.
    assert.strictEqual(
      vscode.workspace.asRelativePath((await resolveWorkspacePage(doc, 'Home.md'))!, false),
      'Home.md'
    );
    // And a plain relative path to a non-.md file is something a wikilink cannot express at all.
    assert.strictEqual(await resolveWorkspacePage(doc, '../assets/notes.txt'), null);
    assert.strictEqual(
      rel(await resolveDocumentLink(doc, '../assets/notes.txt')),
      'assets/notes.txt'
    );
  });

  test('finds the line of an anchor heading, and reports -1 when nothing matches', async () => {
    const design = vscode.Uri.joinPath(wiki(), 'docs/Design.md');
    assert.strictEqual(await headingLine(design, 'the-cli'), 4);
    assert.strictEqual(await headingLine(design, 'nope'), -1);
    assert.strictEqual(await headingLine(design, ''), -1);
  });
});
