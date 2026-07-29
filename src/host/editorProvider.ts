import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import type { EditorToHost, HostToEditor } from '../shared/messages';
import { roundTripEqual } from '../shared/roundtrip';
import { discoverBlocks } from './blockDiscovery';
import { saveBlockExport } from './saveExport';
import { splitThreads, withThreads, type Thread } from '../shared/threads';
import { findBacklinks } from './backlinks';
import { wikiTargetCandidates } from '../shared/references';
import { resolveWorkspacePage } from './wikiResolve';
import { resolveAuthor } from './identity';
import { brokenRelativeLinks } from './diagnostics';
import { fetchGitHubData } from './github';
import { fetchLinkMeta } from './linkMeta';
import { runPrompt, listModels, PromptError } from './lm';

/**
 * The custom editor: replaces VS Code's text editor for `.md` with the OMD webview.
 * The host is the single source of truth on disk; the webview is a rich view over
 * the same markdown (docs/design/ARCHITECTURE.md).
 *
 * The one hazard this class exists to defeat is the sync loop: a save triggers a
 * re-render that emits an edit that triggers another save. We guard it two ways —
 * a whitespace-normalized comparison so identical content never re-fires, and a
 * suppression flag so the host's own edit isn't echoed back to the editor.
 */
export class OmdEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'omd.editor';

  /** The most recently resolved/focused editor, so a global command can push to it. */
  private active?: { document: vscode.TextDocument; post: (msg: HostToEditor) => void };

  /** Fires when the focused OMD document changes, so the GitHub preview can follow it. */
  private readonly _onDidChangeActiveDocument = new vscode.EventEmitter<vscode.TextDocument>();
  readonly onDidChangeActiveDocument = this._onDidChangeActiveDocument.event;

  private setActive(document: vscode.TextDocument, post: (msg: HostToEditor) => void): void {
    this.active = { document, post };
    this._onDidChangeActiveDocument.fire(document);
  }

  static create(
    context: vscode.ExtensionContext,
    log: vscode.OutputChannel
  ): OmdEditorProvider {
    const provider = new OmdEditorProvider(context, log);
    context.subscriptions.push(
      vscode.window.registerCustomEditorProvider(OmdEditorProvider.viewType, provider, {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false
      })
    );
    return provider;
  }

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: vscode.OutputChannel
  ) {}

  /** The document in the currently-focused OMD editor, or undefined. Custom editors aren't
   *  "active text editors", so the GitHub-preview command reads the target from here. */
  activeDocument(): vscode.TextDocument | undefined {
    return this.active?.document;
  }

  /** Sign in to GitHub (interactively) and push the repo's contributors/issues to the editor. */
  async connectGitHub(): Promise<void> {
    if (!this.active) {
      void vscode.window.showInformationMessage('OMD: open an OMD document first.');
      return;
    }
    const data = await fetchGitHubData(this.active.document, this.log, true);
    if (data) this.active.post({ type: 'github', data });
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const webview = panel.webview;
    // Allow the webview to load the bundle (extension `media/`), the document's own folder (so
    // relative image links resolve), and every workspace folder (media referenced from elsewhere).
    const docDir = vscode.Uri.joinPath(document.uri, '..');
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'media'),
        docDir,
        ...(vscode.workspace.workspaceFolders ?? []).map((f) => f.uri)
      ]
    };
    webview.html = this.renderHtml(webview);
    // Base URI the editor joins relative image `src`s against (local media under the CSP).
    const mediaBase = webview.asWebviewUri(docDir).toString();

    // Monotonic document version. Every host->editor push carries the version the
    // editor should now hold; the editor echoes it back on edit so we can tell a
    // stale edit from a fresh one.
    let version = 0;
    // True while the host is applying an edit that originated in the editor, so the
    // onDidChangeTextDocument handler below does not bounce it back as a setDocument.
    let applyingEditorEdit = false;

    const post = (msg: HostToEditor) => webview.postMessage(msg);
    this.setActive(document, post);
    // Track focus switches between already-open OMD editors so `activeDocument()` and the preview
    // follow the editor the user is actually in (custom editors don't fire onDidChangeActiveTextEditor).
    panel.onDidChangeViewState((e) => {
      if (e.webviewPanel.active) this.setActive(document, post);
    });

    // Re-validate on a pause, not per keystroke — the checks include filesystem stats. The
    // editor also gets the unresolved link targets so it can mark them broken inline.
    const runDiagnostics = async () => {
      try {
        post({ type: 'diagnostics', broken: await brokenRelativeLinks(document) });
      } catch (err) {
        this.log.appendLine(`[diagnostics] failed: ${String(err)}`);
      }
    };
    let validateTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleValidate = () => {
      if (validateTimer) clearTimeout(validateTimer);
      validateTimer = setTimeout(() => void runDiagnostics(), 400);
    };

    // Thread metadata for this document. The host holds it and strips it from the text the
    // editor sees, so an editor round-trip can never drop a reviewer's comments; it is
    // re-attached on every write (docs/design/ARCHITECTURE.md, docs/design/FORMATS.md).
    let threads: Thread[] = [];

    // In-flight AI-block runs, keyed by the request nonce, so a `cancelPrompt` (or the panel
    // closing) can abort a streaming model call. The webview never reaches a model itself.
    const promptTokens = new Map<string, vscode.CancellationTokenSource>();

    // Backlinks depend on *other* files, so they are recomputed on open and whenever any
    // markdown file in the workspace is saved — not on every keystroke here.
    const pushBacklinks = async () => {
      try {
        post({ type: 'backlinks', backlinks: await findBacklinks(document, this.log) });
      } catch (err) {
        this.log.appendLine(`[backlinks] failed: ${String(err)}`);
      }
    };

    const pushDocument = () => {
      version++;
      const split = splitThreads(document.getText());
      threads = split.threads;
      post({ type: 'setDocument', text: split.body, version });
      post({ type: 'threads', threads });
    };

    // The AI block's model picker. Discovered host-side (the webview can't reach `vscode.lm`) and
    // pushed only when AI is enabled — an empty list when it's off, so the picker degrades to a
    // free-text field. Listing sends no data and shows no consent prompt.
    const pushModels = async () => {
      const enabled = vscode.workspace.getConfiguration('omd.ai').get<boolean>('enabled', false);
      try {
        post({ type: 'models', enabled, models: enabled ? await listModels() : [] });
      } catch (err) {
        this.log.appendLine(`[models] discovery failed: ${String(err)}`);
        post({ type: 'models', enabled, models: [] });
      }
    };

    // Editor -> host: apply the serialized markdown to the document if it actually
    // differs. The normalized compare is the primary loop guard.
    const onMessage = webview.onDidReceiveMessage(async (msg: EditorToHost) => {
      switch (msg.type) {
        case 'ready':
          // Send the media base before the document so images render with resolvable URLs.
          post({ type: 'mediaBase', base: mediaBase });
          pushDocument();
          // Discover smart blocks and push the resolved set; failure here must never
          // block the document from rendering.
          try {
            post({ type: 'blocks', blocks: await discoverBlocks(document, this.log) });
          } catch (err) {
            this.log.appendLine(`[blocks] discovery failed: ${String(err)}`);
          }
          void pushBacklinks();
          void runDiagnostics();
          // Resolve the comment author (never prompts); failure just leaves the placeholder.
          try {
            post({ type: 'identity', author: await resolveAuthor(document, this.log) });
          } catch (err) {
            this.log.appendLine(`[identity] failed: ${String(err)}`);
          }
          // Fetch GitHub data only if the user is already signed in — never prompt on open.
          void fetchGitHubData(document, this.log, false).then((data) => {
            if (data) post({ type: 'github', data });
          });
          // Populate the AI block's model picker (empty unless AI is enabled).
          void pushModels();
          break;
        case 'edit': {
          // The editor only ever sees the body, so put the thread metadata back before the
          // text reaches disk.
          const next = withThreads(msg.text, threads);
          if (roundTripEqual(next, document.getText())) {
            return; // identical content — do not re-fire
          }
          applyingEditorEdit = true;
          try {
            const edit = new vscode.WorkspaceEdit();
            const whole = new vscode.Range(
              document.positionAt(0),
              document.positionAt(document.getText().length)
            );
            edit.replace(document.uri, whole, next);
            await vscode.workspace.applyEdit(edit);
          } finally {
            applyingEditorEdit = false;
          }
          break;
        }
        case 'updateThreads': {
          // The editor sends intent; the host is the only writer. Re-attach the new metadata
          // to whatever body is currently on disk.
          threads = msg.threads;
          const next = withThreads(splitThreads(document.getText()).body, threads);
          if (next === document.getText()) return;
          applyingEditorEdit = true;
          try {
            const edit = new vscode.WorkspaceEdit();
            edit.replace(
              document.uri,
              new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)),
              next
            );
            await vscode.workspace.applyEdit(edit);
          } finally {
            applyingEditorEdit = false;
          }
          break;
        }
        case 'openTarget':
          await this.openTarget(msg.target, document);
          break;
        case 'saveAs': {
          // A block exported its preview; the host owns disk access, so it runs the dialog.
          this.log.appendLine(`[saveAs] request: ${msg.name} (${msg.encoding}, ${msg.data.length} chars)`);
          try {
            const dest = await saveBlockExport(document.uri, msg.name, msg.data, msg.encoding);
            if (!dest) {
              this.log.appendLine('[saveAs] cancelled');
              break;
            }
            this.log.appendLine(`[saveAs] wrote ${dest.fsPath}`);
            // Confirm visibly — otherwise a successful export looks like nothing happened.
            void vscode.window
              .showInformationMessage(`OMD: saved ${vscode.workspace.asRelativePath(dest)}`, 'Reveal')
              .then((pick) => {
                if (pick === 'Reveal') void vscode.commands.executeCommand('revealFileInOS', dest);
              });
          } catch (err) {
            this.log.appendLine(`[saveAs] failed: ${String(err)}`);
            void vscode.window.showErrorMessage(`OMD: could not save the file. ${String(err)}`);
          }
          break;
        }
        case 'fetchLinkMeta': {
          // A linkcard was inserted or refreshed; fetch its preview metadata host-side (the
          // webview can't) and reply, correlated by nonce. Never fetched on load.
          this.log.appendLine(`[linkMeta] fetch ${msg.url}`);
          try {
            const meta = await fetchLinkMeta(msg.url);
            post({ type: 'linkMeta', nonce: msg.nonce, meta });
          } catch (err) {
            this.log.appendLine(`[linkMeta] failed: ${String(err)}`);
            post({ type: 'linkMeta', nonce: msg.nonce, meta: null });
          }
          break;
        }
        case 'runPrompt': {
          // An AI block was Run/Refreshed. Only the host holds `vscode.lm`; gate on the opt-in
          // setting, then stream the model's answer back correlated by nonce. Never on load.
          const cfg = vscode.workspace.getConfiguration('omd.ai');
          if (!cfg.get<boolean>('enabled', false)) {
            post({
              type: 'promptError',
              nonce: msg.nonce,
              code: 'disabled',
              message: 'AI features are off. Enable "omd.ai.enabled" in Settings to run AI blocks.'
            });
            break;
          }
          const family = msg.model || cfg.get<string>('model', 'gpt-4o');
          const source = new vscode.CancellationTokenSource();
          promptTokens.set(msg.nonce, source);
          this.log.appendLine(`[runPrompt] ${msg.nonce} family=${family} ctx=${msg.context?.length ?? 0}`);
          try {
            await runPrompt(
              { prompt: msg.prompt, context: msg.context, family },
              (text) => post({ type: 'promptChunk', nonce: msg.nonce, text }),
              source.token
            );
            post({ type: 'promptDone', nonce: msg.nonce });
          } catch (err) {
            const code = err instanceof PromptError ? err.code : 'error';
            const message = err instanceof Error ? err.message : String(err);
            this.log.appendLine(`[runPrompt] ${msg.nonce} failed (${code}): ${message}`);
            post({ type: 'promptError', nonce: msg.nonce, code, message });
          } finally {
            promptTokens.get(msg.nonce)?.dispose();
            promptTokens.delete(msg.nonce);
          }
          break;
        }
        case 'cancelPrompt': {
          const source = promptTokens.get(msg.nonce);
          if (source) {
            source.cancel();
            source.dispose();
            promptTokens.delete(msg.nonce);
          }
          break;
        }
        case 'pong':
          this.log.appendLine(`pong ${msg.nonce}`);
          break;
        case 'log':
          this.log.appendLine(`[webview:${msg.level}] ${msg.message}`);
          break;
      }
    });

    // Host -> editor: external changes (another editor, a git checkout, an undo on
    // the underlying document) re-render. Skip changes the editor itself caused and
    // changes that are content-identical to what the editor already holds.
    const onDocChange = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) return;
      scheduleValidate(); // validate on our own edits too — the content really did change
      if (applyingEditorEdit) return; // our own edit, already in the editor
      pushDocument();
    });

    // Another page may have gained or lost a link to this one. Recompute on save *and* on edit
    // (debounced) — `findBacklinks` reads open docs from memory, so a wikilink typed in another
    // editor updates this page's backlinks live, before that file is even saved.
    const isMarkdown = (d: vscode.TextDocument) =>
      d.languageId === 'markdown' || d.uri.path.endsWith('.md');
    let backlinkTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleBacklinks = () => {
      if (backlinkTimer) clearTimeout(backlinkTimer);
      backlinkTimer = setTimeout(() => void pushBacklinks(), 400);
    };
    const onSave = vscode.workspace.onDidSaveTextDocument((saved) => {
      if (isMarkdown(saved)) void pushBacklinks();
    });
    const onAnyChange = vscode.workspace.onDidChangeTextDocument((e) => {
      // A change in *another* markdown file may add/remove a link here; our own edits already
      // trigger pushDocument, but re-running the (in-memory) scan keeps backlinks consistent too.
      if (isMarkdown(e.document)) scheduleBacklinks();
    });

    // Toggling `omd.ai.enabled` (or changing the default model) re-pushes the model picker, so
    // turning AI on populates the dropdown without a reload.
    const onConfig = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('omd.ai')) void pushModels();
    });

    panel.onDidDispose(() => {
      if (this.active?.document.uri.toString() === document.uri.toString()) this.active = undefined;
      if (validateTimer) clearTimeout(validateTimer);
      if (backlinkTimer) clearTimeout(backlinkTimer);
      // Abort any AI run still streaming so the model call doesn't outlive the editor.
      for (const source of promptTokens.values()) {
        source.cancel();
        source.dispose();
      }
      promptTokens.clear();
      onMessage.dispose();
      onDocChange.dispose();
      onSave.dispose();
      onAnyChange.dispose();
      onConfig.dispose();
    });
  }

  /**
   * Resolve a followed reference. A URL opens externally; anything else is a wikilink target,
   * resolved to a `.md` page in the workspace (a sibling first, then anywhere) so references
   * lead to real destinations rather than dead text.
   */
  private async openTarget(target: string, document: vscode.TextDocument): Promise<void> {
    if (/^https?:\/\//i.test(target)) {
      await vscode.env.openExternal(vscode.Uri.parse(target));
      return;
    }
    const found = await resolveWorkspacePage(document, target);
    if (found) {
      await vscode.commands.executeCommand('vscode.open', found);
      return;
    }
    this.log.appendLine(`[refs] no page found for [[${target}]]`);
    void vscode.window.showInformationMessage(
      `OMD: no page named "${wikiTargetCandidates(target)[0]}.md" in this workspace.`
    );
  }

  private renderHtml(webview: vscode.Webview): string {
    const nonce = randomBytes(16).toString('base64');
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'webview.js')
    );
    // Strict CSP: only our nonce'd script runs; styles are injected inline as text
    // (CSS-as-text, docs/design/DECISIONS.md); fonts/images as data URIs from the bundle.
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
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>OMD</title>
</head>
<body>
  <div id="omd-root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
