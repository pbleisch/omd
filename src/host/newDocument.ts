import * as vscode from 'vscode';
import { discoverTemplates } from './templateDiscovery';
import { ensureMdExtension, renderNewDocument } from '../shared/templates';

/**
 * "New document from template". The pure decisions — the file-name handling and
 * the filled-in content — live in the shared model; this is the thin VS Code prompt/IO glue.
 */

/** Where a new document should be created: beside the active document, else the workspace root. */
export function newDocumentFolder(): vscode.Uri | undefined {
  const active = vscode.window.activeTextEditor?.document.uri;
  if (active && active.scheme === 'file') return vscode.Uri.joinPath(active, '..');
  return vscode.workspace.workspaceFolders?.[0]?.uri;
}

export async function newFromTemplate(log: vscode.OutputChannel): Promise<void> {
  const templates = await discoverTemplates(vscode.window.activeTextEditor?.document, log);

  const picked = await vscode.window.showQuickPick(
    templates.map((t) => ({ label: t.title, description: t.description, template: t })),
    { title: 'New OMD document', placeHolder: 'Choose a template' }
  );
  if (!picked) return;

  const folder = newDocumentFolder();
  if (!folder) {
    void vscode.window.showErrorMessage('OMD: open a folder before creating a document.');
    return;
  }

  const fileName = await vscode.window.showInputBox({
    title: 'New OMD document',
    prompt: 'File name',
    value: `${picked.template.name}.md`,
    validateInput: (v) => (v.trim() ? undefined : 'A file name is required.')
  });
  if (!fileName) return;

  const uri = vscode.Uri.joinPath(folder, ensureMdExtension(fileName.trim()));
  try {
    await vscode.workspace.fs.stat(uri);
    void vscode.window.showErrorMessage(`OMD: ${fileName} already exists.`);
    return;
  } catch {
    /* good — the file does not exist yet */
  }

  const content = renderNewDocument(picked.template, fileName);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
  await vscode.commands.executeCommand('vscode.openWith', uri, 'omd.editor');
}
