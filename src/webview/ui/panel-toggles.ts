import { codicon } from '../codicons';

/**
 * Per-side panel toggles. The Outline and Comments panels already hide when
 * empty (calm surface, Principle 6); these let a writer collapse a *populated* panel to focus,
 * and re-open it. Each toggle only appears when its side has something to show — the CSS keys
 * that off the `omd-has-outline` / `omd-has-threads` body classes the panels already set.
 */
function toggleButton(side: 'left' | 'right', icon: string, title: string, bodyClass: string): HTMLElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `omd-panel-toggle omd-panel-toggle--${side}`;
  btn.title = title;
  btn.appendChild(codicon(icon));
  btn.addEventListener('click', () => document.body.classList.toggle(bodyClass));
  return btn;
}

export function mountPanelToggles(container: HTMLElement): void {
  container.append(
    toggleButton('left', 'list-tree', 'Toggle the outline', 'omd-collapse-outline'),
    toggleButton('right', 'comment', 'Toggle comments', 'omd-collapse-comments')
  );
}
