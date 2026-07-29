import * as vscode from 'vscode';

/**
 * Write a smart block's exported preview to a user-chosen file (docs/design/ARCHITECTURE.md — the host
 * is the only writer to disk). The webview posts a `saveAs` message with the bytes; this shows a
 * save dialog seeded next to the document and writes them. Kept as a standalone, injectable
 * function so the real-extension-host integration test can drive it with a stubbed dialog.
 *
 * Returns the destination on success, or `undefined` when the user cancelled.
 */
export async function saveBlockExport(
  documentUri: vscode.Uri,
  name: string,
  data: string,
  encoding: 'base64' | 'utf8'
): Promise<vscode.Uri | undefined> {
  const dest = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.joinPath(documentUri, '..', name)
  });
  if (!dest) return undefined;
  await vscode.workspace.fs.writeFile(dest, Buffer.from(data, encoding));
  return dest;
}
