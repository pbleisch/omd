import type { EditorView } from 'prosemirror-view';
import { CellSelection } from 'prosemirror-tables';
import { onEditorUpdate } from '../commands/state-events';
import { openParamPopover } from './popover';
import { codicon } from '../codicons';
import { isAiEnabled, onModelsChanged } from '../blocks/models-registry';
import { startRevise, canRevise } from '../blocks/revise';

/**
 * The "revise with AI" marker: an accent-filled button beside a selection (just right of the
 * comment marker) that rewrites the selected text per a typed instruction, shown as an inline diff
 * (plugins/revise). Opt-in — it is hidden unless `omd.ai.enabled` (so the surface stays calm by
 * default), and re-evaluates when the host pushes a new AI state. A monochrome `sparkle` codicon,
 * matching the comment marker (docs/design/STYLE.md — chrome uses codicons).
 */
export function mountReviseMarker(view: EditorView): void {
  const marker = document.createElement('button');
  marker.type = 'button';
  marker.className = 'omd-revise-marker';
  marker.title = 'Revise with AI';
  marker.setAttribute('aria-label', 'Revise with AI');
  marker.appendChild(codicon('sparkle'));
  marker.style.display = 'none';
  document.body.appendChild(marker);

  marker.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const coords = view.coordsAtPos(view.state.selection.to);
    openParamPopover({
      anchor: coords,
      label: 'Revise with AI',
      value: '',
      onCommit: (instruction) => {
        if (instruction.trim()) startRevise(view, instruction);
      }
    });
  });

  const reposition = (v: EditorView) => {
    // Same suppression as the comment marker (empty / unfocused / multi-cell), plus the AI gate.
    if (!isAiEnabled() || !canRevise(v) || !v.hasFocus() || v.state.selection instanceof CellSelection) {
      marker.style.display = 'none';
      return;
    }
    const end = v.coordsAtPos(v.state.selection.to);
    marker.style.display = '';
    // Sit just right of the comment marker (anchored at end.right + 6, ~26px wide) with a small gap.
    marker.style.left = `${end.right + 38}px`;
    marker.style.top = `${end.top - 4}px`;
  };

  onEditorUpdate(reposition);
  // Toggling `omd.ai.enabled` (host push) shows/hides the marker without a reload.
  onModelsChanged(() => reposition(view));
}
