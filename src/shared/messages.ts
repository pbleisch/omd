/**
 * The single message contract shared by host and editor. Everything crosses the
 * two-process boundary as one of these; the discriminated union is the envelope
 * every later feature rides on. See docs/design/ARCHITECTURE.md ("Two processes").
 */

import type { BlockDefinition } from './blocks';
import type { Thread } from './threads';
import type { Backlink } from './references';
import type { GitHubData } from './github';
import type { LinkMeta } from './linkMeta';
import type { ModelInfo } from './models';

/** Sent host -> editor (webview). */
export type HostToEditor =
  /** Full document text; the editor should render it. `version` guards the sync loop. */
  | { type: 'setDocument'; text: string; version: number }
  /** The resolved smart-block set (three-layer discovery); the editor offers/renders them. */
  | { type: 'blocks'; blocks: BlockDefinition[] }
  /**
   * Comment threads for the open document. The host owns this metadata and strips it from
   * the text it sends, so an editor round-trip can never destroy it (docs/design/ARCHITECTURE.md).
   */
  | { type: 'threads'; threads: Thread[] }
  /** Pages elsewhere in the workspace whose wikilinks point at this document. */
  | { type: 'backlinks'; backlinks: Backlink[] }
  /**
   * Webview base URI for the document's folder (`webview.asWebviewUri(dir)`). The editor joins
   * relative image `src`s against it so local media (`![](media/x.png)`) loads under the webview
   * CSP. Stable per document; sent before the first `setDocument`.
   */
  | { type: 'mediaBase'; base: string }
  /** The resolved comment author (git user.name → GitHub → OS user); labels new comments. */
  | { type: 'identity'; author: string }
  /** Repo contributors (for the `@mention` picker) and open issues (for `#references`). */
  | { type: 'github'; data: GitHubData }
  /**
   * AI availability + the models for the AI block's picker. `enabled` mirrors `omd.ai.enabled` and
   * gates the AI affordances (the inline-revise marker/menu hide when it's false). `models` is the
   * list discovered host-side from `vscode.lm` (the webview can't) — empty when AI is off or no
   * provider is installed. Re-sent when the relevant settings change. Listing sends no data and
   * shows no consent prompt (consent is on the first request, not on discovery).
   */
  | { type: 'models'; enabled: boolean; models: ModelInfo[] }
  /**
   * Link targets that don't resolve on disk (from the same filesystem check that feeds the
   * Problems panel). The editor marks matching links broken inline — the reveal a custom text
   * editor can't get from a Problems-panel click.
   */
  | { type: 'diagnostics'; broken: string[] }
  /** Round-trip / liveness ping answered by the editor with `pong`. */
  | { type: 'ping'; nonce: string }
  /**
   * Answer to a `fetchLinkMeta` request, correlated by `nonce`. `meta` is null when the fetch
   * failed (offline, non-HTML, timeout) — the editor keeps its placeholder card in that case.
   */
  | { type: 'linkMeta'; nonce: string; meta: LinkMeta | null }
  /**
   * One streamed fragment of a `runPrompt` response, correlated by `nonce`. Many arrive in order,
   * then exactly one `promptDone` (success) or `promptError` (failure). The webview can't reach a
   * model — only the host holds `vscode.lm` — so every AI-block run rides this channel.
   */
  | { type: 'promptChunk'; nonce: string; text: string }
  /** The `runPrompt` stream for `nonce` finished cleanly. No more chunks follow. */
  | { type: 'promptDone'; nonce: string }
  /**
   * The `runPrompt` for `nonce` failed. `code` classifies it so the editor can show the right
   * message: AI turned off, no model/consent, quota, cancelled, or an unexpected error.
   */
  | {
      type: 'promptError';
      nonce: string;
      code: 'disabled' | 'no-model' | 'no-consent' | 'quota' | 'cancelled' | 'error';
      message: string;
    };

/** Sent editor (webview) -> host. */
export type EditorToHost =
  /** The editor booted and is ready to receive the initial document. */
  | { type: 'ready' }
  /** The document changed in the editor; `text` is the serialized markdown. */
  | { type: 'edit'; text: string; version: number }
  /**
   * The user followed a reference. `target` is either a URL (a mention or issue) or a
   * workspace page name (a wikilink); only the host can resolve and open either.
   */
  | { type: 'openTarget'; target: string }
  /**
   * The full thread list after a comment action. The host owns the metadata and is the only
   * writer, so the editor sends intent rather than editing the block itself.
   */
  | { type: 'updateThreads'; threads: Thread[] }
  /** Answer to a `ping`. */
  | { type: 'pong'; nonce: string }
  /**
   * Export a smart block's preview to a file. The host shows a save dialog (seeded with `name`,
   * next to the document) and writes `data` decoded per `encoding` — the webview is sandboxed
   * and cannot write to disk itself.
   */
  | { type: 'saveAs'; name: string; data: string; encoding: 'base64' | 'utf8' }
  /** Non-fatal diagnostic the editor wants surfaced in the host log. */
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string }
  /**
   * Fetch link-preview metadata for `url`. Only the host can fetch (the webview is CSP/CORS
   * blocked); it replies with `linkMeta` carrying the same `nonce`. Sent only on an explicit
   * insert or refresh — never automatically on load (privacy + network cost).
   */
  | { type: 'fetchLinkMeta'; nonce: string; url: string }
  /**
   * Run an AI-block prompt against a VS Code language model. The host does the call (only it has
   * `vscode.lm`), gated behind the `omd.ai.enabled` setting, and streams the answer back as
   * `promptChunk`… `promptDone`/`promptError`, correlated by `nonce`. `context` is text the editor
   * assembled (e.g. the whole document, for `scope: document`); `model` overrides `omd.ai.model`.
   * Sent only on an explicit Run/Refresh — never on load — so opening a file makes no model call.
   * Feature-neutral: the later inline-revise flow reuses this exact message with the selection.
   */
  | { type: 'runPrompt'; nonce: string; prompt: string; context?: string; model?: string }
  /** Cancel an in-flight `runPrompt` (the block was deleted, or Run pressed again). */
  | { type: 'cancelPrompt'; nonce: string };

export type AnyMessage = HostToEditor | EditorToHost;
