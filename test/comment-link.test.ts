import { describe, it, expect, beforeEach } from 'vitest';
import { mountEditor } from './helpers/editor';
import { setActiveThread, getActiveThread, onActiveThreadChange } from '../src/webview/blocks/active-thread';

/**
 * #6: comment ↔ document linking. The shared active-thread state connects the document's
 * comment-region highlight and the thread panel. Here we verify the state itself and that the
 * comments plugin reflects the active thread with a stronger region highlight.
 */

describe('active thread state', () => {
  beforeEach(() => setActiveThread(null));
  it('notifies listeners on set and clear', () => {
    const seen: (string | null)[] = [];
    const off = onActiveThreadChange((id) => seen.push(id));
    setActiveThread('t1');
    setActiveThread(null);
    expect(seen).toEqual(['t1', null]);
    expect(getActiveThread()).toBeNull();
    off();
  });
});

describe('document region reflects the active thread', () => {
  beforeEach(() => setActiveThread(null));
  it('adds the active highlight to the region whose thread is active', async () => {
    const { root } = await mountEditor('See <!-- omd-start:t1 -->this part<!-- omd-end:t1 --> here.\n');
    // The commented span is highlighted and tagged with its thread id.
    const region = root.querySelector('.omd-comment-highlight[data-thread="t1"]');
    expect(region).toBeTruthy();
    expect(root.querySelector('.omd-comment-highlight--active')).toBeNull();

    // Making the thread active (as clicking it in the panel would) strengthens the region.
    setActiveThread('t1');
    expect(root.querySelector('.omd-comment-highlight--active')?.getAttribute('data-thread')).toBe('t1');

    setActiveThread(null);
    expect(root.querySelector('.omd-comment-highlight--active')).toBeNull();
  });
});

describe('thread panel card click reveals the region (thread → doc)', () => {
  beforeEach(() => setActiveThread(null));
  it('sets the active thread when clicking the card body, not just the "Open" badge', async () => {
    const { mountThreadPanel } = await import('../src/webview/ui/thread-panel');
    const { setThreads } = await import('../src/webview/blocks/threads-registry');
    const { mountEditor } = await import('./helpers/editor');

    const { handle } = await mountEditor('See <!-- omd-start:t1 -->this part<!-- omd-end:t1 --> here.\n');
    setThreads([
      { id: 't1', status: 'open', comments: [{ author: 'me', body: 'a note', date: '2020-01-01' }] }
    ]);

    const container = document.createElement('div');
    document.body.appendChild(container);
    mountThreadPanel(container, handle.getView());

    const card = container.querySelector<HTMLElement>('.omd-thread[data-thread="t1"]')!;
    expect(card).toBeTruthy();

    // Clicking the comment body (not the "Open" badge) must reveal/activate the thread.
    const body = card.querySelector<HTMLElement>('.omd-thread-body')!;
    body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(getActiveThread()).toBe('t1');

    setThreads([]);
  });
});

describe('thread panel orders cards by document position', () => {
  beforeEach(() => setActiveThread(null));
  it('renders threads top-to-bottom by where their region appears, not by metadata order', async () => {
    const { mountThreadPanel } = await import('../src/webview/ui/thread-panel');
    const { setThreads } = await import('../src/webview/blocks/threads-registry');
    const { mountEditor } = await import('./helpers/editor');

    // t2's region appears BEFORE t1's in the document.
    const { handle } = await mountEditor(
      'Alpha <!-- omd-start:t2 -->two<!-- omd-end:t2 --> then beta <!-- omd-start:t1 -->one<!-- omd-end:t1 --> end.\n'
    );
    // Metadata order is t1 then t2 (insertion order).
    setThreads([
      { id: 't1', status: 'open', comments: [{ author: 'me', body: 'first added', date: '2020-01-01' }] },
      { id: 't2', status: 'open', comments: [{ author: 'me', body: 'second added', date: '2020-01-02' }] }
    ]);

    const container = document.createElement('div');
    document.body.appendChild(container);
    mountThreadPanel(container, handle.getView());

    const order = [...container.querySelectorAll<HTMLElement>('.omd-thread')].map((el) => el.dataset.thread);
    expect(order).toEqual(['t2', 't1']); // document order, not metadata order

    setThreads([]);
  });
});
