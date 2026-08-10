import * as vscode from 'vscode';
import { OmdEditorProvider } from './editorProvider';
import { newFromTemplate } from './newDocument';
import { exportHtmlCommand } from './exportCommand';
import { makeDefaultEditor, restoreDefaultEditor } from './defaultEditor';

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel('OMD');
  context.subscriptions.push(log);
  log.appendLine('OMD activated');

  const provider = OmdEditorProvider.create(context, log);

  // Escape hatches between the rich editor and the plain text editor. The default
  // text editor stays reachable so a `.md` is never trapped in the custom editor.
  context.subscriptions.push(
    vscode.commands.registerCommand('omd.reopenAsText', (uri?: vscode.Uri) => {
      const target = uri ?? activeMarkdownUri(provider);
      if (target) {
        vscode.commands.executeCommand('vscode.openWith', target, 'default');
      }
    }),
    vscode.commands.registerCommand('omd.openWith', (uri?: vscode.Uri) => {
      const target = uri ?? activeMarkdownUri(provider);
      if (target) {
        vscode.commands.executeCommand('vscode.openWith', target, OmdEditorProvider.viewType);
      }
    }),
    // The standing preference, opt-in and reversible. OMD registers at `priority: "option"`, so
    // these are the only way `.md` starts (or stops) opening in OMD by default. No `when` clause on
    // either: both must be invocable cold, with no markdown file open.
    vscode.commands.registerCommand('omd.makeDefaultEditor', () =>
      makeDefaultEditor(OmdEditorProvider.viewType, log)
    ),
    vscode.commands.registerCommand('omd.restoreDefaultEditor', () =>
      restoreDefaultEditor(OmdEditorProvider.viewType, log)
    ),
    vscode.commands.registerCommand('omd.newFromTemplate', () => newFromTemplate(log)),
    vscode.commands.registerCommand('omd.exportHtml', (uri?: vscode.Uri) =>
      exportHtmlCommand(
        uri ?? activeMarkdownUri(provider),
        log,
        vscode.Uri.joinPath(context.extensionUri, 'media').fsPath
      )
    ),
    vscode.commands.registerCommand('omd.connectGitHub', () => provider.connectGitHub()),
    vscode.commands.registerCommand('omd.githubPreview', async (uri?: vscode.Uri) => {
      // The target: an explicit uri, else the focused OMD editor's doc, else the active text editor.
      let doc: vscode.TextDocument | undefined;
      if (uri) doc = await vscode.workspace.openTextDocument(uri);
      else doc = provider.activeDocument() ?? vscode.window.activeTextEditor?.document;
      if (!doc || doc.languageId !== 'markdown') {
        void vscode.window.showInformationMessage('OMD: open a markdown document to preview.');
        return;
      }
      // Imported here, not at activation: the preview drags the whole render stack behind it.
      const { GitHubPreview } = await import('./githubPreview');
      GitHubPreview.show(context, log, doc, provider.onDidChangeActiveDocument);
    })
  );
}

/**
 * The URI of the focused markdown document. A `.md` open in the OMD custom editor is **not** an
 * "active text editor", so `vscode.window.activeTextEditor` is undefined there — the OMD provider's
 * own tracking is the reliable source, with the plain text editor as a fallback.
 */
function activeMarkdownUri(provider: OmdEditorProvider): vscode.Uri | undefined {
  const fromOmd = provider.activeDocument()?.uri;
  if (fromOmd) return fromOmd;
  const ed = vscode.window.activeTextEditor;
  return ed?.document.languageId === 'markdown' ? ed.document.uri : undefined;
}

export function deactivate(): void {
  /* nothing to tear down beyond the disposables above */
}
