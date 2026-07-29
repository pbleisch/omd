import * as vscode from 'vscode';
import type { ModelInfo } from '../shared/models';

/**
 * The one place OMD talks to a language model. The webview is a sandboxed, network-less iframe
 * (docs/design/ARCHITECTURE.md), so every AI-block run crosses to the host and lands here; this
 * module wraps `vscode.lm` and nothing else knows about the model API. It is deliberately
 * feature-neutral — the AI block and the later inline-revise flow both call {@link runPrompt}.
 *
 * Nothing here runs on document load: callers reach it only from an explicit user action, which is
 * also what lets `selectChatModels` raise the Copilot consent prompt when needed.
 */

/** Classified failures, mapped to the `promptError` codes the editor renders. */
export type PromptErrorCode = 'no-model' | 'no-consent' | 'quota' | 'cancelled' | 'error';

export class PromptError extends Error {
  constructor(
    readonly code: PromptErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'PromptError';
  }
}

export interface RunPromptOptions {
  /** The user's instruction — the block's `prompt` param. */
  prompt: string;
  /** Optional context the editor assembled (e.g. the whole document for `scope: document`). */
  context?: string;
  /** Model *family* to select (`omd.ai.model`, or a per-block override). */
  family: string;
}

/**
 * All available chat models, deduped by family, for the AI block's picker. Listing does not send a
 * request, so it neither triggers the consent dialog nor counts as egress. Returns [] on any error
 * (no provider installed, not yet authorized) — the picker falls back to a free-text field.
 */
export async function listModels(): Promise<ModelInfo[]> {
  let models: readonly vscode.LanguageModelChat[] = [];
  try {
    models = await vscode.lm.selectChatModels();
  } catch {
    return [];
  }
  const byFamily = new Map<string, ModelInfo>();
  for (const m of models) {
    if (!byFamily.has(m.family)) byFamily.set(m.family, { family: m.family, name: m.name, vendor: m.vendor });
  }
  return [...byFamily.values()];
}

/** Pick the first chat model in `family`; throws `no-model` when none is available. */
async function selectModel(family: string): Promise<vscode.LanguageModelChat> {
  let models: readonly vscode.LanguageModelChat[] = [];
  try {
    models = await vscode.lm.selectChatModels(family ? { family } : undefined);
  } catch (err) {
    throw new PromptError('no-model', `No language model available: ${String(err)}`);
  }
  if (models.length === 0) {
    // Fall back to *any* model if the requested family isn't installed, so a stale/misspelled
    // `omd.ai.model` still works when the user has some Copilot model.
    if (family) {
      try {
        models = await vscode.lm.selectChatModels();
      } catch {
        models = [];
      }
    }
    if (models.length === 0) {
      throw new PromptError(
        'no-model',
        'No language model is available. Install GitHub Copilot (or another chat model provider) and sign in.'
      );
    }
  }
  return models[0];
}

/**
 * Run `prompt` (with optional `context`) against a model in `family`, streaming each text
 * fragment to `onChunk`. Resolves when the stream ends; throws a {@link PromptError} on failure.
 * `token` cancels an in-flight request.
 *
 * The Language Model API has no system role, so an instruction preamble and the context are folded
 * into a leading user message, followed by the prompt itself.
 */
export async function runPrompt(
  opts: RunPromptOptions,
  onChunk: (text: string) => void,
  token: vscode.CancellationToken
): Promise<void> {
  const model = await selectModel(opts.family);

  const messages: vscode.LanguageModelChatMessage[] = [];
  const context = opts.context?.trim();
  if (context) {
    messages.push(
      vscode.LanguageModelChatMessage.User(
        'You are an assistant embedded in a markdown document. Use the following document as ' +
          'context, and reply in GitHub-flavored markdown only (no code fences around the whole ' +
          `answer, no preamble).\n\n---\n${context}\n---`
      )
    );
  } else {
    messages.push(
      vscode.LanguageModelChatMessage.User(
        'Reply in GitHub-flavored markdown only — no preamble, no code fence around the whole answer.'
      )
    );
  }
  messages.push(vscode.LanguageModelChatMessage.User(opts.prompt));

  try {
    const response = await model.sendRequest(messages, {}, token);
    for await (const fragment of response.text) {
      if (token.isCancellationRequested) throw new PromptError('cancelled', 'Cancelled.');
      onChunk(fragment);
    }
  } catch (err) {
    if (err instanceof PromptError) throw err;
    if (token.isCancellationRequested) throw new PromptError('cancelled', 'Cancelled.');
    if (err instanceof vscode.LanguageModelError) {
      // `.code` is the name of the factory (docs: `err.code === LanguageModelError.NotFound.name`).
      const code: PromptErrorCode =
        err.code === vscode.LanguageModelError.NoPermissions.name
          ? 'no-consent'
          : err.code === vscode.LanguageModelError.Blocked.name
            ? 'quota'
            : err.code === vscode.LanguageModelError.NotFound.name
              ? 'no-model'
              : 'error';
      throw new PromptError(code, err.message);
    }
    throw new PromptError('error', String(err));
  }
}
