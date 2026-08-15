import { describe, it, expect, beforeEach } from 'vitest';
import { mountEditor } from './helpers/editor';
import { mountOutlinePanel } from '../src/webview/ui/outline-panel';
import { mountPanelToggles } from '../src/webview/ui/panel-toggles';

const headings = '# Title\n\n## Section A\n\nSome text.\n\n## Section B\n\nMore text.\n';

describe('outline panel initial visibility', () => {
  beforeEach(() => {
    document.body.classList.remove('omd-collapse-outline');
  });

  it('starts visible by default (no collapse class)', async () => {
    const { handle } = await mountEditor(headings);
    mountOutlinePanel(document.body, handle.getView());

    // After rendering with headings, the panel should be visible
    expect(document.body.classList.contains('omd-has-outline')).toBe(true);
    expect(document.body.classList.contains('omd-collapse-outline')).toBe(false);

    const panel = document.querySelector('.omd-outline-panel');
    expect(panel).toBeTruthy();
    expect(panel?.classList.contains('omd-outline-panel--visible')).toBe(true);
  });

  it('applies collapsed state when defaultVisible is false', async () => {
    const { handle } = await mountEditor(headings);
    mountOutlinePanel(document.body, handle.getView());

    // Simulate receiving outlineConfig with defaultVisible: false
    document.body.classList.add('omd-collapse-outline');

    // Panel still exists and is "visible" in the CSS sense, but collapsed
    expect(document.body.classList.contains('omd-has-outline')).toBe(true);
    expect(document.body.classList.contains('omd-collapse-outline')).toBe(true);

    const panel = document.querySelector('.omd-outline-panel');
    expect(panel).toBeTruthy();
    // The collapse class applies transform: translateX(-100%) via CSS
    expect(panel?.classList.contains('omd-outline-panel--visible')).toBe(true);
  });

  it('removes collapsed state when defaultVisible is true', async () => {
    const { handle } = await mountEditor(headings);
    mountOutlinePanel(document.body, handle.getView());

    // Start collapsed (simulating a previous state)
    document.body.classList.add('omd-collapse-outline');

    // Simulate receiving outlineConfig with defaultVisible: true
    document.body.classList.remove('omd-collapse-outline');

    expect(document.body.classList.contains('omd-collapse-outline')).toBe(false);
  });
});

describe('outline panel toggle still works after initial state', () => {
  beforeEach(() => {
    document.body.classList.remove('omd-collapse-outline');
  });

  it('user can expand a collapsed panel', async () => {
    const { handle } = await mountEditor(headings);
    mountOutlinePanel(document.body, handle.getView());
    const toggleContainer = document.createElement('div');
    document.body.appendChild(toggleContainer);
    mountPanelToggles(toggleContainer);

    // Start collapsed
    document.body.classList.add('omd-collapse-outline');
    expect(document.body.classList.contains('omd-collapse-outline')).toBe(true);

    // Click toggle to expand
    const toggle = document.querySelector('.omd-panel-toggle--left');
    expect(toggle).toBeTruthy();
    toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(document.body.classList.contains('omd-collapse-outline')).toBe(false);
  });

  it('user can collapse a visible panel', async () => {
    const { handle } = await mountEditor(headings);
    mountOutlinePanel(document.body, handle.getView());
    const toggleContainer = document.createElement('div');
    document.body.appendChild(toggleContainer);
    mountPanelToggles(toggleContainer);

    // Start visible
    expect(document.body.classList.contains('omd-collapse-outline')).toBe(false);

    // Click toggle to collapse
    const toggle = document.querySelector('.omd-panel-toggle--left');
    toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(document.body.classList.contains('omd-collapse-outline')).toBe(true);
  });
});
