/**
 * A language model, as surfaced to the editor for the AI block's model picker. The host discovers
 * these from `vscode.lm.selectChatModels()` (host-only) and pushes them over the message boundary;
 * the webview never reaches the model API itself. Deduped by `family` — the handle the block stores
 * and the LM service selects by (see src/host/lm.ts).
 */
export interface ModelInfo {
  /** Opaque family handle, e.g. `gpt-4o`, `o1`, `claude-3.5-sonnet`. What the block's `model` param stores. */
  family: string;
  /** Human-readable label for the dropdown, e.g. "GPT-4o". */
  name: string;
  /** Vendor id, e.g. `copilot`. Shown as a hint when several vendors offer the same family name. */
  vendor: string;
}
