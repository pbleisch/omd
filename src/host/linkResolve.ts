import * as vscode from 'vscode';
import { parseHref, pathCandidates, schemeOf } from '../shared/links';
import { headingSlugs } from '../shared/diagnostics';

/**
 * Ordinary markdown link resolution: **relative to the document that contains the link**.
 *
 * This is deliberately *not* `wikiResolve.ts`. A wikilink names a page and is looked up anywhere
 * in the workspace; `[a](docs/DESIGN.md)` names a path and means the file at that path next to
 * this document. Sending markdown links through the wikilink resolver happens to work from a
 * repository root and quietly resolves to the wrong file from a subdirectory.
 *
 * Standalone (not a method) so the real-host integration tests can exercise it directly.
 */

export interface ResolvedLink {
  /** The file the link points at. */
  uri: vscode.Uri;
  /** The link's `#fragment` as a GitHub heading slug, or '' when it has none. */
  fragment: string;
}

/**
 * Resolve `href` against `document`, or null when nothing is there. A leading `/` is
 * workspace-folder-relative (what VS Code's own markdown preview does); everything else is
 * document-relative, including `../` — which is the case the wikilink resolver cannot express.
 */
export async function resolveDocumentLink(
  document: vscode.TextDocument,
  href: string
): Promise<ResolvedLink | null> {
  const { path, fragment } = parseHref(href);
  if (!path) return null; // a bare `#anchor` never reaches the host — the editor scrolls itself
  for (const candidate of pathCandidates(path)) {
    const uri = candidateUri(document, candidate);
    if (uri && (await exists(uri))) return { uri, fragment };
  }
  return null;
}

/** Where a single candidate path would live, or null when it cannot be placed. */
function candidateUri(document: vscode.TextDocument, path: string): vscode.Uri | null {
  if (schemeOf(path) === 'file') return vscode.Uri.parse(path);
  if (path.startsWith('/')) {
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    return folder ? vscode.Uri.joinPath(folder.uri, path) : null;
  }
  return vscode.Uri.joinPath(document.uri, '..', path);
}

/**
 * The 0-based line of the heading whose GitHub slug is `slug`, or -1. Used to reveal the anchor
 * of a `file.md#heading` link in whichever editor opens the file.
 */
export async function headingLine(uri: vscode.Uri, slug: string): Promise<number> {
  if (!slug || !/\.mdx?$/i.test(uri.path)) return -1;
  try {
    // `openTextDocument` returns the live buffer when the target is already open, so a heading
    // added but not saved yet is still followable. It does not show an editor by itself.
    const document = await vscode.workspace.openTextDocument(uri);
    return headingSlugs(document.getText()).find((h) => h.slug === slug)?.line ?? -1;
  } catch {
    return -1;
  }
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}
