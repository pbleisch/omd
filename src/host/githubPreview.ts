import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import { SHIKI_CSS } from '../shared/shiki-css';
import { splitThreads } from '../shared/threads';
import { githubSlug } from './github';
import { githubCss } from './exportCommand';

/**
 * The live "render like GitHub" preview panel (showcase/BUGS.md "GitHub preview fidelity"). A single
 * WebviewPanel beside the editor that shows the active OMD document rendered through the *same*
 * shared pipeline the HTML export uses (`shared/github-render.ts`) — so the preview and the export
 * agree. Math is MathJax SVG (self-contained), and the panel client renders the mermaid blocks the
 * pipeline emits. It updates live as the bound document is edited.
 *
 * Local relative image `src`s are rewritten to webview URIs so workspace media loads under the CSP
 * (remote https/data images pass through). One panel is reused; re-running the command retargets it.
 */
export class GitHubPreview {
  private static current?: GitHubPreview;

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private doc: vscode.TextDocument;
  private renderTimer?: ReturnType<typeof setTimeout>;
  private ready = false;

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: vscode.OutputChannel,
    doc: vscode.TextDocument,
    onActiveChange: vscode.Event<vscode.TextDocument>
  ) {
    this.doc = doc;
    this.panel = vscode.window.createWebviewPanel(
      'omd.githubPreview',
      previewTitle(doc),
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'media'),
          vscode.Uri.joinPath(doc.uri, '..'),
          ...(vscode.workspace.workspaceFolders ?? []).map((f) => f.uri)
        ]
      }
    );
    this.panel.webview.html = this.shell();

    this.disposables.push(
      this.panel.webview.onDidReceiveMessage((msg) => {
        if (msg?.type === 'ready') {
          this.ready = true;
          void this.render();
        }
      }),
      // Re-render when the bound document changes (debounced).
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.toString() === this.doc.uri.toString()) this.scheduleRender();
      }),
      // Follow the active OMD editor: when the user switches to another OMD document, retarget.
      onActiveChange((next) => this.retarget(next))
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  /** Open (or reveal + retarget) the preview for `doc`; it then follows the active OMD editor. */
  static show(
    context: vscode.ExtensionContext,
    log: vscode.OutputChannel,
    doc: vscode.TextDocument,
    onActiveChange: vscode.Event<vscode.TextDocument>
  ): void {
    if (GitHubPreview.current) {
      GitHubPreview.current.retarget(doc);
      GitHubPreview.current.panel.reveal(vscode.ViewColumn.Beside, true);
    } else {
      GitHubPreview.current = new GitHubPreview(context, log, doc, onActiveChange);
    }
  }

  private retarget(doc: vscode.TextDocument): void {
    if (doc.uri.toString() === this.doc.uri.toString()) return; // already showing it
    this.doc = doc;
    this.panel.title = previewTitle(doc);
    void this.render();
  }

  private scheduleRender(): void {
    if (this.renderTimer) clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => void this.render(), 250);
  }

  private async render(): Promise<void> {
    if (!this.ready) return;
    try {
      const { body } = splitThreads(this.doc.getText());
      const repoSlug = (await githubSlug(this.doc)) ?? undefined;
      // The render stack (remark, Shiki grammars, MathJax) loads on the first render, not at
      // activation — opening a document must not pay for a preview nobody asked for.
      const [{ renderGitHubHtml }, { mathRenderer }] = await Promise.all([
        import('../shared/github-render'),
        import('./math-svg')
      ]);
      let html = await renderGitHubHtml(body, {
        renderMath: await mathRenderer(body),
        repoSlug
      });
      html = this.rewriteLocalImages(html);
      await this.panel.webview.postMessage({ type: 'html', html });
    } catch (err) {
      this.log.appendLine(`[preview] render failed: ${String(err)}`);
    }
  }

  /** Rewrite `src`/`href` on relative image paths to webview URIs so workspace media loads. */
  private rewriteLocalImages(html: string): string {
    const dir = vscode.Uri.joinPath(this.doc.uri, '..');
    return html.replace(/(<img\b[^>]*?\bsrc=")([^"]+)(")/gi, (whole, pre, src, post) => {
      if (/^(https?:|data:|vscode-webview-resource:|#|\/\/)/i.test(src)) return whole;
      try {
        const uri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(dir, src));
        return `${pre}${uri.toString()}${post}`;
      } catch {
        return whole;
      }
    });
  }

  private shell(): string {
    const nonce = randomBytes(16).toString('base64');
    const webview = this.panel.webview;
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'panel.js')
    );
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} https: data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource} data:`,
      `script-src 'nonce-${nonce}'`
    ].join('; ');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<style>
${githubCss(vscode.Uri.joinPath(this.context.extensionUri, 'media').fsPath)}
${SHIKI_CSS}
body { margin: 0; }
.markdown-body { box-sizing: border-box; max-width: 980px; margin: 0 auto; padding: 24px 28px; }
.omd-mermaid { margin: 16px 0; text-align: center; }
[data-mermaid-error] { border-left: 3px solid #d1242f; }
</style>
</head>
<body>
<article id="omd-preview" class="markdown-body"></article>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private dispose(): void {
    GitHubPreview.current = undefined;
    if (this.renderTimer) clearTimeout(this.renderTimer);
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }
}

function previewTitle(doc: vscode.TextDocument): string {
  return `Preview: ${doc.uri.path.split('/').pop()}`;
}
