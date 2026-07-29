import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { mountEditor } from './helpers/editor';
import { setBlocks } from '../src/webview/blocks/registry';
import { SHIPPED_BLOCKS } from '../src/shared/blocks';
import { findEditableBlock, openBlockProperties } from '../src/webview/blocks/edit-properties';
import { updateBlockParams } from '../src/webview/blocks/params';
import { closeParamPanel } from '../src/webview/ui/param-panel';
import { normalizeMarkdown } from '../src/shared/roundtrip';

/**
 * Phase 2: editing a smart block's attributes through the typed property panel. The block
 * declares typed params (SHIPPED_BLOCKS: chart, youtube); the panel builds a form from
 * them, and applying writes params back to the node so the file round-trips to valid GFM
 * (Principle 2). We exercise the same resolve → panel → write path both triggers use.
 */

const CHART = [
  '<!-- omd:chart {"type":"bar","title":"Revenue"} -->',
  '',
  '| Label | Value |',
  '| --- | --- |',
  '| A | 10 |',
  '',
  '<!-- /omd:chart -->',
  ''
].join('\n');

/** Put the cursor inside the first text node matching `text`. */
function cursorAt(view: EditorView, text: string): void {
  let at = -1;
  view.state.doc.descendants((node, pos) => {
    if (at >= 0) return false;
    if (node.isText && node.text === text) at = pos + 1;
    return true;
  });
  if (at < 0) throw new Error(`no text ${text}`);
  view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(at))));
}

describe('finding an editable block', () => {
  beforeEach(() => setBlocks(SHIPPED_BLOCKS));

  it('resolves the enclosing container that declares params', async () => {
    const { handle } = await mountEditor(CHART);
    const view = handle.getView();
    cursorAt(view, 'A'); // inside the chart's data table, nested in the container
    const block = findEditableBlock(view.state);
    expect(block?.kind === 'shortcode' && block.def.name).toBe('chart');
    expect(view.state.doc.nodeAt(block!.pos)?.type.name).toBe('shortcode_container');
  });

  it('returns null in plain text with no enclosing block', async () => {
    const { handle } = await mountEditor('just text\n');
    const view = handle.getView();
    cursorAt(view, 'just text');
    expect(findEditableBlock(view.state)).toBeNull();
  });
});

describe('writing params back', () => {
  beforeEach(() => setBlocks(SHIPPED_BLOCKS));

  it('updateBlockParams rewrites a container shortcode and round-trips', async () => {
    const { handle } = await mountEditor(CHART);
    const view = handle.getView();
    cursorAt(view, 'A');
    const block = findEditableBlock(view.state)!;
    updateBlockParams(view, block.pos, { type: 'line', title: 'Revenue' });
    const out = normalizeMarkdown(handle.getMarkdown());
    expect(out).toContain('<!-- omd:chart {"type":"line","title":"Revenue"} -->');
    expect(out).toContain('<!-- /omd:chart -->');
  });
});

describe('the property panel', () => {
  beforeEach(() => {
    setBlocks(SHIPPED_BLOCKS);
    document.body.innerHTML = '';
    closeParamPanel();
  });

  it('builds a field per declared param, seeded from stored values', async () => {
    const { handle } = await mountEditor(CHART);
    const view = handle.getView();
    cursorAt(view, 'A');
    openBlockProperties(view, findEditableBlock(view.state)!);

    const panel = document.querySelector('.omd-param-panel')!;
    expect(panel).toBeTruthy();
    const title = panel.querySelector<HTMLInputElement>('input[type="text"]')!;
    const type = panel.querySelector<HTMLSelectElement>('select')!;
    expect(title.value).toBe('Revenue');
    expect(type.value).toBe('bar');
    // The enum offers exactly the declared options.
    expect([...type.options].map((o) => o.value)).toEqual(['bar', 'line', 'pie', 'doughnut']);
  });

  it('auto-applies each field change and round-trips (no Apply button)', async () => {
    const { handle } = await mountEditor(CHART);
    const view = handle.getView();
    cursorAt(view, 'A');
    openBlockProperties(view, findEditableBlock(view.state)!);

    const panel = document.querySelector('.omd-param-panel')!;
    // Editing existing blocks auto-applies — there is no Apply button, the panel stays open.
    expect(panel.querySelector('.omd-param-panel-apply')).toBeNull();

    const title = panel.querySelector<HTMLInputElement>('input[type="text"]')!;
    title.value = 'Quarterly';
    title.dispatchEvent(new Event('change', { bubbles: true }));
    const type = panel.querySelector<HTMLSelectElement>('select')!;
    type.value = 'pie';
    type.dispatchEvent(new Event('change', { bubbles: true }));

    const out = normalizeMarkdown(handle.getMarkdown());
    expect(out).toContain('"type":"pie"');
    expect(out).toContain('"title":"Quarterly"');
    expect(document.querySelector('.omd-param-panel')).toBeTruthy(); // stays open
  });
});

describe('hover to reveal', () => {
  beforeEach(() => {
    setBlocks(SHIPPED_BLOCKS);
    closeParamPanel();
  });
  afterEach(() => vi.useRealTimers());

  it('opens after a brief hover and closes after leaving block and panel', async () => {
    const { root, handle } = await mountEditor(CHART);
    handle.getView(); // ensure rendered
    const blockEl = root.querySelector<HTMLElement>('.omd-block--chart')!;
    expect(blockEl).toBeTruthy();

    vi.useFakeTimers();
    blockEl.dispatchEvent(new MouseEvent('mouseenter'));
    // Nothing yet — the reveal is deliberately delayed.
    expect(document.querySelector('.omd-param-panel')).toBeNull();
    vi.advanceTimersByTime(400);
    expect(document.querySelector('.omd-param-panel')).toBeTruthy();

    // Leaving the block schedules a close; after the grace period it dismisses.
    blockEl.dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(400);
    expect(document.querySelector('.omd-param-panel')).toBeNull();
  });

  it('keeps the panel open when the pointer moves into it', async () => {
    const { root, handle } = await mountEditor(CHART);
    handle.getView();
    const blockEl = root.querySelector<HTMLElement>('.omd-block--chart')!;

    vi.useFakeTimers();
    blockEl.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(400);
    const panel = document.querySelector<HTMLElement>('.omd-param-panel')!;
    expect(panel).toBeTruthy();

    // Travel: leave the block but enter the panel before the grace period elapses.
    blockEl.dispatchEvent(new MouseEvent('mouseleave'));
    panel.parentElement!.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(400);
    expect(document.querySelector('.omd-param-panel')).toBeTruthy();
  });
});
