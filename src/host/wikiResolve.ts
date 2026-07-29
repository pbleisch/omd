import * as vscode from 'vscode';
import { wikiTargetCandidates } from '../shared/references';

/**
 * Resolve a wikilink/markdown-link `target` to a workspace file, or null. Standalone (not a method)
 * so the real-host integration tests can exercise it directly. Resolution order:
 *   1. a workspace-relative path (`dir/Page.md`, what a backlink sends);
 *   2. a sibling of the current document with an exact candidate name;
 *   3. a **case-insensitive** sibling match — a GH wiki is a flat page set, and slug casing
 *      shouldn't block click-through on a case-sensitive filesystem (`[[page name]]` → `Page-Name.md`);
 *   4. anywhere in the workspace by basename.
 * Candidates are the literal target plus its GitHub-wiki space→dash form (`shared/references`).
 */
export async function resolveWorkspacePage(
  document: vscode.TextDocument,
  target: string
): Promise<vscode.Uri | null> {
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (folder && /[\\/]/.test(target) && /\.md$/i.test(target)) {
    const direct = vscode.Uri.joinPath(folder.uri, target);
    if (await exists(direct)) return direct;
  }

  const candidates = wikiTargetCandidates(target);

  for (const name of candidates) {
    const sibling = vscode.Uri.joinPath(document.uri, '..', `${name}.md`);
    if (await exists(sibling)) return sibling;
  }

  try {
    const dir = vscode.Uri.joinPath(document.uri, '..');
    const wanted = new Set(candidates.map((c) => `${c.toLowerCase()}.md`));
    for (const [name, type] of await vscode.workspace.fs.readDirectory(dir)) {
      if (type === vscode.FileType.File && wanted.has(name.toLowerCase())) {
        return vscode.Uri.joinPath(dir, name);
      }
    }
  } catch {
    /* directory unreadable — fall through to the workspace search */
  }

  for (const name of candidates) {
    const base = name.split(/[\\/]/).pop()!;
    const [found] = await vscode.workspace.findFiles(`**/${base}.md`, '**/node_modules/**', 1);
    if (found) return found;
  }
  return null;
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}
