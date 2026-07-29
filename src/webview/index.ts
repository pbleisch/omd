import { createOmdEditor, type OmdEditorHandle } from './editor';
import { onHostMessage, post, log } from './vscode';
import { normalizeMarkdown } from '../shared/roundtrip';
import baseStyles from './styles.css';
import { codiconCss } from './codicons';
import { mountToolbar } from './ui/toolbar';
import { mountThreadPanel } from './ui/thread-panel';
import { mountCommentMarker } from './ui/comment-marker';
import { mountReviseMarker } from './ui/revise-marker';
import { mountOutlinePanel } from './ui/outline-panel';
import { mountPanelToggles } from './ui/panel-toggles';
import { setBacklinks } from './blocks/backlinks-registry';
import { setMediaBase } from './blocks/media-base';
import { setAuthor } from './blocks/identity';
import { setGitHub } from './blocks/github-registry';
import { setBlocks } from './blocks/registry';
import { setModels } from './blocks/models-registry';
import { setThreads } from './blocks/threads-registry';
import { registerBrandIcons } from './blocks/brand-icons';
import { registerUiIcons } from './blocks/ui-icons';
import { setBrokenLinks } from './plugins/references';
import { mountProblemsChip } from './ui/problems-chip';
import { resolveLinkMeta } from './blocks/linkcard';
import { resolvePromptChunk, resolvePromptDone, resolvePromptError } from './blocks/ai';

/** Concatenate all plugin CSS-as-text into one injected stylesheet (docs/design/DECISIONS.md). */
function injectStyles(): void {
  const style = document.createElement('style');
  style.textContent = [codiconCss, baseStyles].join('\n');
  document.head.appendChild(style);
}

/** Debounce editor -> host edits so we serialize on a pause, not per keystroke. */
function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let handle: ReturnType<typeof setTimeout> | undefined;
  return ((...args: Parameters<T>) => {
    if (handle) clearTimeout(handle);
    handle = setTimeout(() => fn(...args), ms);
  }) as T;
}

async function main(): Promise<void> {
  injectStyles();
  registerBrandIcons(); // brand logos resolvable by codicon() before any block renders
  registerUiIcons(); // custom UI glyphs (align-left/center/right) for the same reason
  const root = document.getElementById('omd-root');
  if (!root) {
    log('error', 'missing #omd-root');
    return;
  }

  // The version the host last told us to hold. Echoed back on edit so the host can
  // distinguish a fresh edit from a stale one.
  let version = 0;
  // Broken-link targets can arrive before the editor finishes mounting; hold them until it exists.
  let pendingBroken: string[] | null = null;
  // The last text we know is in sync with the host, normalized. Guards the loop:
  // an edit whose normalized form matches this is not sent.
  let lastSynced = '';
  let handle: OmdEditorHandle | undefined;

  const sendEdit = debounce((markdown: string) => {
    if (normalizeMarkdown(markdown) === lastSynced) return;
    lastSynced = normalizeMarkdown(markdown);
    post({ type: 'edit', text: markdown, version });
  }, 300);

  onHostMessage((msg) => {
    switch (msg.type) {
      case 'setDocument': {
        version = msg.version;
        const incoming = normalizeMarkdown(msg.text);
        if (handle && incoming === lastSynced) return; // nothing changed
        lastSynced = incoming;
        if (handle) {
          handle.setMarkdown(msg.text);
        } else {
          void createOmdEditor({
            root,
            initial: msg.text,
            onEdit: (markdown) => sendEdit(markdown)
          }).then((h) => {
            handle = h;
            // One toolbar, in a sticky host above the writing surface. It is a thin
            // front-end over the same command registry the keymap and slash menu use.
            const toolbarHost = document.createElement('div');
            toolbarHost.className = 'omd-toolbar-host';
            document.body.insertBefore(toolbarHost, root);
            mountToolbar(toolbarHost, h.getView());
            // The one thread panel, plus the add-comment marker that starts a thread on a selection.
            mountThreadPanel(document.body, h.getView());
            mountCommentMarker(h.getView());
            // The ✦ revise-with-AI marker (opt-in; hidden unless omd.ai.enabled).
            mountReviseMarker(h.getView());
            mountOutlinePanel(document.body, h.getView());
            mountPanelToggles(document.body);
            // The document-issues chip, right-aligned at the end of the toolbar bar: the aggregate
            // view + home for problems with no inline anchor.
            const toolbarBar = toolbarHost.querySelector<HTMLElement>('.omd-toolbar');
            if (toolbarBar) mountProblemsChip(toolbarBar, h);
            if (pendingBroken) {
              setBrokenLinks(h.getView(), pendingBroken);
              pendingBroken = null;
            }
          });
        }
        break;
      }
      case 'blocks':
        setBlocks(msg.blocks);
        break;
      case 'threads':
        setThreads(msg.threads);
        break;
      case 'backlinks':
        setBacklinks(msg.backlinks);
        break;
      case 'mediaBase':
        setMediaBase(msg.base);
        break;
      case 'identity':
        setAuthor(msg.author);
        break;
      case 'github':
        setGitHub(msg.data);
        break;
      case 'models':
        setModels(msg.models, msg.enabled);
        break;
      case 'diagnostics':
        if (handle) setBrokenLinks(handle.getView(), msg.broken);
        else pendingBroken = msg.broken;
        break;
      case 'ping':
        post({ type: 'pong', nonce: msg.nonce });
        break;
      case 'linkMeta':
        resolveLinkMeta(msg.nonce, msg.meta);
        break;
      case 'promptChunk':
        resolvePromptChunk(msg.nonce, msg.text);
        break;
      case 'promptDone':
        resolvePromptDone(msg.nonce);
        break;
      case 'promptError':
        resolvePromptError(msg.nonce, { code: msg.code, message: msg.message });
        break;
    }
  });

  post({ type: 'ready' });
}

void main();
