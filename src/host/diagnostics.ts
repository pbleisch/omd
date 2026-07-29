import * as vscode from 'vscode';
import { fileLinkTargets } from '../shared/diagnostics';

/**
 * The one document check that needs the filesystem: a relative link whose target file doesn't
 * exist. OMD surfaces problems **inline in the editor**, not in the Problems panel (VS Code can't
 * reveal a range inside a custom editor, and diagnostic offsets don't map cleanly to the rendered
 * doc), so this returns the unresolved targets and the host posts them to the webview, which marks
 * the matching links broken. Every other check is pure and runs webview-side (`shared/diagnostics`).
 */
export async function brokenRelativeLinks(document: vscode.TextDocument): Promise<string[]> {
  const broken: string[] = [];
  for (const link of fileLinkTargets(document.getText())) {
    const uri = vscode.Uri.joinPath(document.uri, '..', link.target);
    try {
      await vscode.workspace.fs.stat(uri);
    } catch {
      broken.push(link.target);
    }
  }
  return broken;
}
