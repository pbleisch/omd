import type { EditorView } from 'prosemirror-view';
import { requestPrompt, type PromptFailure } from './ai';
import { isAiEnabled } from './models-registry';
import {
  beginRevise,
  pushReviseChunk,
  finishRevise,
  failRevise,
  getReviseState
} from '../plugins/revise/plugin';

/**
 * Inline revision: rewrite the current selection per a natural-language instruction, shown as an
 * inline diff (see plugins/revise). This is the second AI surface, and it reuses the AI block's
 * streaming client (`requestPrompt`) and the host LM service **unchanged** — running the model
 * needs no new host or protocol work. Host-mediated (the webview can't reach a model), opt-in
 * (`isAiEnabled`), and ephemeral: the document is untouched until the user Accepts the diff.
 */

/** The model instruction: revise the selected text, return only the rewrite as GFM. */
function buildRevisePrompt(instruction: string, selection: string): string {
  return (
    'You are editing a selection from a markdown document. Rewrite the text below according to ' +
    `this instruction: "${instruction}". Return ONLY the rewritten text as GitHub-flavored ` +
    'markdown — no explanation, no preamble, no surrounding code fence.\n\n' +
    `TEXT:\n${selection}`
  );
}

/** True when a revision can be started here: AI on, a non-empty text selection. */
export function canRevise(view: EditorView): boolean {
  const { from, to, empty } = view.state.selection;
  return isAiEnabled() && !empty && to > from;
}

/**
 * Start a revision over the current selection. Captures the range and its text, opens the inline
 * diff in `streaming`, and streams the model's rewrite into it. A no-op if AI is off or the
 * selection is empty. The instruction comes from the caller (a popover prompt).
 */
export function startRevise(view: EditorView, instruction: string): void {
  const trimmed = instruction.trim();
  if (!trimmed || !canRevise(view)) return;
  const { from, to } = view.state.selection;
  const selection = view.state.doc.textBetween(from, to, '\n', ' ');
  if (!selection.trim()) return;

  const { nonce, done } = requestPrompt(
    { prompt: buildRevisePrompt(trimmed, selection) },
    (chunk) => pushReviseChunk(view, nonce, chunk)
  );
  beginRevise(view, from, to, nonce);

  done
    .then((text) => finishRevise(view, nonce, text))
    .catch((err: PromptFailure) => {
      // A user cancel (Reject/Stop) already cleared the diff; don't resurrect it as an error.
      if (err?.code === 'cancelled') return;
      if (getReviseState(view)?.nonce === nonce) failRevise(view, nonce, err?.message || 'Revision failed.');
    });
}
