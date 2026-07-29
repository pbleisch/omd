import type { EditorView } from 'prosemirror-view';
import { post } from '../vscode';
import { parseParams, stringifyParams, buildOpen } from '../../shared/shortcode';
import { parseMarkdownDoc, currentMarkdown } from './md-bridge';

/**
 * The `ai` built-in (docs/design/FORMATS.md, `omd:ai`). On disk it's a container whose params carry
 * the embedded `prompt` (plus `scope` and an optional `model`), and whose body caches the generated
 * markdown — so a GitHub reader sees the result and the file round-trips byte-for-byte. Nothing runs
 * on load: a model call happens only on an explicit Run/Refresh, exactly like the linkcard's fetch.
 *
 * The webview can't reach a model (it's a sandboxed, network-less iframe), so a run is *intent* sent
 * to the host, which owns `vscode.lm`; answers stream back as `promptChunk`/`promptDone`/`promptError`
 * correlated by nonce. This request plumbing is feature-neutral — inline-revise will reuse it.
 */

export type AiScope = 'none' | 'document';

/** Normalize a stored `scope` param to a known value. */
export function aiScope(params: Record<string, unknown>): AiScope {
  return params.scope === 'document' ? 'document' : 'none';
}

/**
 * The document context to send for a given scope: nothing for `none`, the whole document markdown
 * for `document`. (Inline-revise will later pass a selection instead, through the same channel.)
 */
export function aiContext(scope: AiScope): string | undefined {
  return scope === 'document' ? currentMarkdown() || undefined : undefined;
}

// --- host request/response, correlated by nonce (streaming, like linkMeta but multi-message) ---

interface PendingRun {
  onChunk: (text: string) => void;
  resolve: (fullText: string) => void;
  reject: (err: PromptFailure) => void;
  buffer: string;
}

export interface PromptFailure {
  code: 'disabled' | 'no-model' | 'no-consent' | 'quota' | 'cancelled' | 'error';
  message: string;
}

const pending = new Map<string, PendingRun>();
let seq = 0;

export interface RunPromptArgs {
  prompt: string;
  context?: string;
  model?: string;
}

/**
 * Ask the host to run `prompt`, streaming fragments to `onChunk`. Resolves with the full text, or
 * rejects with a {@link PromptFailure}. Returns the nonce too, so the caller can `cancelPrompt`.
 */
export function requestPrompt(
  args: RunPromptArgs,
  onChunk: (text: string) => void
): { nonce: string; done: Promise<string> } {
  const nonce = `ai-${Date.now()}-${seq++}`;
  const done = new Promise<string>((resolve, reject) => {
    pending.set(nonce, { onChunk, resolve, reject, buffer: '' });
    post({ type: 'runPrompt', nonce, prompt: args.prompt, context: args.context, model: args.model });
  });
  return { nonce, done };
}

/** Cancel an in-flight run and reject its promise locally. */
export function cancelPrompt(nonce: string): void {
  if (pending.has(nonce)) {
    post({ type: 'cancelPrompt', nonce });
    pending.get(nonce)?.reject({ code: 'cancelled', message: 'Cancelled.' });
    pending.delete(nonce);
  }
}

/** Route a host `promptChunk` to its run (called from the message pump). */
export function resolvePromptChunk(nonce: string, text: string): void {
  const run = pending.get(nonce);
  if (!run) return;
  run.buffer += text;
  run.onChunk(text);
}

/** Route a host `promptDone` — the stream finished cleanly. */
export function resolvePromptDone(nonce: string): void {
  const run = pending.get(nonce);
  if (!run) return;
  pending.delete(nonce);
  run.resolve(run.buffer);
}

/** Route a host `promptError` — the run failed. */
export function resolvePromptError(nonce: string, failure: PromptFailure): void {
  const run = pending.get(nonce);
  if (!run) return;
  pending.delete(nonce);
  run.reject(failure);
}

// --- applying the generated result back into the document ---

/**
 * Replace the `ai` container's body at `pos` with the parsed `markdown` result, in one transaction.
 * Params (prompt/scope/model) are untouched — only the cached body changes. Mirrors
 * applyLinkcardMeta; keeps the opener bytes canonical so the block still round-trips.
 */
export function applyAiResult(view: EditorView, pos: number, markdown: string): void {
  const node = view.state.doc.nodeAt(pos);
  if (!node || node.attrs.name !== 'ai') return;
  const doc = parseMarkdownDoc(markdown);
  const schema = view.state.schema;
  // Fall back to a single paragraph so the container never ends up with empty (invalid) content.
  const content =
    doc && doc.content.childCount > 0
      ? doc.content
      : schema.nodes.paragraph.create(null, markdown ? schema.text(markdown) : undefined);

  const params = parseParams(node.attrs.params as string);
  const p = stringifyParams(params);
  const tr = view.state.tr;
  tr.replaceWith(pos + 1, pos + node.nodeSize - 1, content);
  // Re-stamp canonical opener bytes (params unchanged, but keep them normalized like other blocks).
  tr.setNodeMarkup(pos, undefined, { ...node.attrs, params: p, openRaw: buildOpen('ai', p) });
  view.dispatch(tr);
}

/** Set (or clear) a single `ai` param at `pos`, rebuilding the opener bytes. Returns success. */
export function commitAiParam(view: EditorView, pos: number, key: string, value: string): boolean {
  const node = view.state.doc.nodeAt(pos);
  if (!node || node.attrs.name !== 'ai') return false;
  const params = parseParams(node.attrs.params as string);
  if (value) params[key] = value;
  else delete params[key];
  const p = stringifyParams(params);
  if (p === node.attrs.params) return false;
  view.dispatch(
    view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, params: p, openRaw: buildOpen('ai', p) })
  );
  return true;
}
