import type { ModelInfo } from '../../shared/models';

/**
 * AI availability + the available language models, as last pushed by the host (`models` message).
 * `enabled` mirrors `omd.ai.enabled` and gates the AI affordances (the inline-revise marker/menu);
 * `models` feeds the AI block's picker — empty when AI is off or no provider is installed, in which
 * case the picker degrades to a free-text field. Mirrors the `blocks`/`github` registries.
 */
let models: ModelInfo[] = [];
let enabled = false;
const listeners = new Set<() => void>();

export function setModels(next: ModelInfo[], isEnabled: boolean): void {
  models = Array.isArray(next) ? next : [];
  enabled = isEnabled === true;
  for (const fn of listeners) fn();
}

export function getModels(): ModelInfo[] {
  return models;
}

/** Whether AI features are turned on (`omd.ai.enabled`). Gates the inline-revise affordances. */
export function isAiEnabled(): boolean {
  return enabled;
}

/** Subscribe to changes (model list or enabled state); returns an unsubscribe. */
export function onModelsChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
