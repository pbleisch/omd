import * as vscode from 'vscode';
import { collectWikilinks, targetMatchesPage, type Backlink } from '../shared/references';

/**
 * Backlinks: the pages elsewhere in the workspace whose wikilinks point at this document.
 * Only the host can do this — it needs the filesystem — and the matching rule
 * itself lives in the shared reference module so it stays testable.
 *
 * The scan is capped and skips `node_modules`, because this runs on open and on every save of
 * a markdown file; a workspace-wide read has to stay cheap enough to be unnoticeable.
 */
const MAX_FILES = 500;

/** The page name a wikilink would use for a document (its file name without `.md`). */
export function pageNameOf(uri: vscode.Uri): string {
  return uri.path.split('/').pop()!.replace(/\.md$/i, '');
}

export async function findBacklinks(
  document: vscode.TextDocument,
  log: vscode.OutputChannel
): Promise<Backlink[]> {
  const pageName = pageNameOf(document.uri);
  const self = document.uri.toString();

  let files: vscode.Uri[];
  try {
    files = await vscode.workspace.findFiles('**/*.md', '**/node_modules/**', MAX_FILES);
  } catch (err) {
    log.appendLine(`[backlinks] scan failed: ${String(err)}`);
    return [];
  }

  // Prefer the in-memory text of any open document so an unsaved edit (a wikilink just typed in
  // another editor) is reflected immediately, rather than only after that file is saved to disk.
  const open = new Map(vscode.workspace.textDocuments.map((d) => [d.uri.toString(), d]));

  const found: Backlink[] = [];
  for (const uri of files) {
    if (uri.toString() === self) continue; // a page doesn't link to itself
    let text: string;
    const live = open.get(uri.toString());
    if (live) {
      text = live.getText();
    } else {
      try {
        text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
      } catch {
        continue; // unreadable file — skip rather than fail the whole scan
      }
    }
    // Cheap pre-filter: a page can only link here via a wikilink or a markdown link.
    if (!text.includes('[[') && !text.includes('](')) continue;

    // A page links here through a wikilink (`[[Page]]`) *or* a relative markdown link
    // (`[label](Page.md)`) — track both so any cross-reference shows as a backlink.
    let label: string | null = null;
    for (const link of collectWikilinks(text)) {
      if (targetMatchesPage(link.target, pageName)) {
        label = link.label;
        break;
      }
    }
    if (label == null) {
      const linkRe = /\[([^\]]*)\]\(([^)\s]+\.md)(?:#[^)]*)?\)/g;
      let m: RegExpExecArray | null;
      while ((m = linkRe.exec(text))) {
        if (/^[a-z]+:/i.test(m[2])) continue; // skip external URLs that merely end in .md
        if (targetMatchesPage(m[2], pageName)) {
          label = m[1] || pageName;
          break;
        }
      }
    }
    if (label != null) {
      found.push({ path: vscode.workspace.asRelativePath(uri), title: pageNameOf(uri), label });
    }
  }
  log.appendLine(`[backlinks] ${found.length} page(s) link to "${pageName}"`);
  return found;
}
