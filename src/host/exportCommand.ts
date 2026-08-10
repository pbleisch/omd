import * as vscode from 'vscode';
import { readFileSync } from 'fs';
import { join } from 'path';
import { githubSlug } from './github';

/**
 * The "Export to HTML" command. Thin VS Code glue over the pure export pipeline:
 * pick a destination, render, write, and offer to open the file. True PDF needs a browser engine
 * OMD does not bundle, so the exported HTML is print-ready and PDF is print-from-page.
 *
 * The GitHub CSS and the mermaid runtime are read from the extension's bundled `media/` folder (a
 * build step copies them there) rather than `node_modules`, which the packaged `.vsix` does not
 * ship. Mermaid is loaded only when the document actually has a diagram. `mediaDir` is the local
 * `media/` path (`context.extensionUri`), so a synchronous read is fine.
 */

export function readMediaText(mediaDir: string | undefined, name: string): string | undefined {
  if (!mediaDir) return undefined;
  try {
    return readFileSync(join(mediaDir, name), 'utf8');
  } catch {
    return undefined;
  }
}

/** GitHub-styled CSS from the bundled media folder; a minimal fallback keeps the export readable. */
export function githubCss(mediaDir?: string): string {
  return (
    readMediaText(mediaDir, 'github-markdown.css') ??
    '.markdown-body{font-family:sans-serif;line-height:1.6}'
  );
}

export async function exportHtmlCommand(
  uri: vscode.Uri | undefined,
  log: vscode.OutputChannel,
  mediaDir?: string
): Promise<void> {
  const target = uri ?? vscode.window.activeTextEditor?.document.uri;
  if (!target) {
    void vscode.window.showErrorMessage('OMD: open a markdown document to export.');
    return;
  }

  let markdown: string;
  try {
    markdown = Buffer.from(await vscode.workspace.fs.readFile(target)).toString('utf8');
  } catch (err) {
    void vscode.window.showErrorMessage(`OMD: could not read the document. ${String(err)}`);
    return;
  }

  const title = target.path.split('/').pop()!.replace(/\.md$/i, '');
  const defaultUri = target.with({ path: target.path.replace(/\.md$/i, '.html') });
  const dest = await vscode.window.showSaveDialog({
    title: 'Export to HTML',
    defaultUri,
    filters: { HTML: ['html'] }
  });
  if (!dest) return;

  try {
    // Load the mermaid runtime only when the document has a diagram (it's large).
    const mermaidRuntime = /```mermaid/.test(markdown)
      ? readMediaText(mediaDir, 'mermaid.min.js')
      : undefined;
    const doc = await vscode.workspace.openTextDocument(target);
    const repoSlug = (await githubSlug(doc)) ?? undefined;
    // The render pipeline (remark, Shiki grammars, MathJax) loads here rather than at activation:
    // most sessions never export (docs/operations/PERFORMANCE.md).
    const { exportToHtml } = await import('./export');
    const html = await exportToHtml(markdown, title, githubCss(mediaDir), mermaidRuntime, repoSlug);
    await vscode.workspace.fs.writeFile(dest, Buffer.from(html, 'utf8'));
    log.appendLine(`[export] wrote ${dest.fsPath}`);
  } catch (err) {
    log.appendLine(`[export] failed: ${String(err)}`);
    void vscode.window.showErrorMessage(`OMD: export failed. ${String(err)}`);
    return;
  }

  const open = await vscode.window.showInformationMessage(
    'Exported HTML. Open it? (Use the browser’s Print → Save as PDF for a PDF.)',
    'Open'
  );
  if (open === 'Open') await vscode.env.openExternal(dest);
}
