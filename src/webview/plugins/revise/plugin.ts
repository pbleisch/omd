import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { EditorView } from 'prosemirror-view';
import { codicon } from '../../codicons';
import { cancelPrompt } from '../../blocks/ai';
import { applyRevision } from './apply';

/**
 * The inline-revision diff. Purely decoration-driven — like the comments plugin, the document is
 * **never edited until Accept**, so the round-trip is never at risk and Reject leaves the file
 * exactly as it was. While a run is in flight the selected text is struck through (an inline
 * decoration) and the streamed rewrite is shown as a widget just after it, with Stop / Accept /
 * Reject controls. Only one revision is pending at a time.
 *
 * The runner (blocks/revise.ts) drives the state through begin/pushChunk/finish/fail; the widget
 * buttons call accept/reject here directly. State carries the request `nonce` so a superseded or
 * cancelled run can't write into a newer (or cleared) diff.
 */

export type RevisePhase = 'streaming' | 'ready' | 'error';

export interface ReviseState {
  from: number;
  to: number;
  /** The streamed / final rewrite. */
  text: string;
  phase: RevisePhase;
  /** Error message when `phase === 'error'`. */
  message?: string;
  /** Correlates host chunks to this diff; also what Reject cancels. */
  nonce: string;
}

const key = new PluginKey<ReviseState | null>('omd-revise');

/** The live diff state for this view, or null when none is pending. */
export function getReviseState(view: EditorView): ReviseState | null {
  return key.getState(view.state) ?? null;
}

function set(view: EditorView, next: ReviseState | null): void {
  view.dispatch(view.state.tr.setMeta(key, next));
}

/** Start a pending diff over `[from, to]`, correlated by `nonce`. Clears any prior one. */
export function beginRevise(view: EditorView, from: number, to: number, nonce: string): void {
  const existing = getReviseState(view);
  if (existing) cancelPrompt(existing.nonce);
  set(view, { from, to, text: '', phase: 'streaming', nonce });
}

/** Append a streamed fragment (no-op if this run was superseded or cleared). */
export function pushReviseChunk(view: EditorView, nonce: string, chunk: string): void {
  const s = getReviseState(view);
  if (!s || s.nonce !== nonce) return;
  set(view, { ...s, text: s.text + chunk });
}

/** Mark the run finished; the diff now shows Accept / Reject. */
export function finishRevise(view: EditorView, nonce: string, text: string): void {
  const s = getReviseState(view);
  if (!s || s.nonce !== nonce) return;
  set(view, { ...s, text: text || s.text, phase: 'ready' });
}

/** Mark the run failed; the diff shows the error and a Dismiss. */
export function failRevise(view: EditorView, nonce: string, message: string): void {
  const s = getReviseState(view);
  if (!s || s.nonce !== nonce) return;
  set(view, { ...s, phase: 'error', message });
}

/** Drop the pending diff without touching the document. Cancels an in-flight run. */
export function clearRevise(view: EditorView): void {
  const s = getReviseState(view);
  if (!s) return;
  if (s.phase === 'streaming') cancelPrompt(s.nonce);
  set(view, null);
  view.focus();
}

/** Apply the rewrite to the document, then clear the diff. */
export function acceptRevise(view: EditorView): void {
  const s = getReviseState(view);
  if (!s || s.phase !== 'ready') return;
  set(view, null);
  applyRevision(view, s.from, s.to, s.text);
}

/** Reject the diff (and cancel an in-flight run). */
export function rejectRevise(view: EditorView): void {
  clearRevise(view);
}

function iconButton(icon: string, title: string, run: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'omd-revise-btn';
  btn.title = title;
  btn.setAttribute('aria-label', title);
  btn.appendChild(codicon(icon));
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    run();
  });
  return btn;
}

/** Build the diff widget shown just after the struck-through original. */
function buildWidget(view: EditorView, s: ReviseState): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = `omd-revise-widget omd-revise--${s.phase}`;
  wrap.contentEditable = 'false';
  wrap.addEventListener('mousedown', (e) => e.preventDefault()); // don't move the selection

  if (s.phase === 'error') {
    const err = document.createElement('span');
    err.className = 'omd-revise-error';
    err.textContent = s.message || 'Revision failed.';
    wrap.append(err, iconButton('close', 'Dismiss', () => rejectRevise(view)));
    return wrap;
  }

  const neo = document.createElement('span');
  neo.className = 'omd-revise-new';
  neo.textContent = s.text || '…';
  wrap.appendChild(neo);

  const controls = document.createElement('span');
  controls.className = 'omd-revise-controls';
  if (s.phase === 'streaming') {
    controls.appendChild(iconButton('stop-circle', 'Stop', () => rejectRevise(view)));
  } else {
    controls.append(
      iconButton('close', 'Reject', () => rejectRevise(view)),
      iconButton('check', 'Accept', () => acceptRevise(view))
    );
  }
  wrap.appendChild(controls);
  return wrap;
}

function decorations(state: import('prosemirror-state').EditorState): DecorationSet {
  const s = key.getState(state);
  if (!s) return DecorationSet.empty;
  const decos: Decoration[] = [];
  if (s.to > s.from) {
    decos.push(Decoration.inline(s.from, s.to, { class: 'omd-revise-old' }));
  }
  decos.push(
    // `key` forces a fresh widget as the streamed text grows and the phase changes.
    Decoration.widget(s.to, (v) => buildWidget(v, s), {
      side: 1,
      key: `revise-${s.phase}-${s.text.length}-${s.message ?? ''}`
    })
  );
  return DecorationSet.create(state.doc, decos);
}

export const revisePlugin = $prose(
  () =>
    new Plugin<ReviseState | null>({
      key,
      state: {
        init: () => null,
        apply(tr, prev) {
          const meta = tr.getMeta(key) as ReviseState | null | undefined;
          if (meta !== undefined) return meta; // explicit set/clear from the control functions
          if (!prev || !tr.docChanged) return prev;
          // Track the range through an incidental edit; drop the diff if it collapsed.
          const from = tr.mapping.map(prev.from, 1);
          const to = tr.mapping.map(prev.to, -1);
          return to > from ? { ...prev, from, to } : null;
        }
      },
      props: {
        decorations,
        handleKeyDown(view, event) {
          if (event.key === 'Escape' && getReviseState(view)) {
            rejectRevise(view);
            return true;
          }
          return false;
        }
      }
    })
);
