import { describe, it, expect, afterEach } from 'vitest';
import { mountEditor } from './helpers/editor';
import { mountProblemsChip } from '../src/webview/ui/problems-chip';

/**
 * The document-issues chip (ui/problems-chip.ts) — OMD's aggregate replacement for the Problems
 * panel. It runs the pure `diagnose()` on the serialized doc and lists the results, including the
 * structural problems (unclosed comment, unbalanced tags) that have no clean inline anchor.
 */

const hosts: HTMLElement[] = [];
function host(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  hosts.push(el);
  return el;
}
const settle = () => new Promise((r) => setTimeout(r, 350));

afterEach(() => {
  hosts.splice(0).forEach((h) => h.remove());
  // The dropdown list lives on document.body (not inside the toolbar's flex row).
  document.querySelectorAll('.omd-problems-list').forEach((n) => n.remove());
});

describe('problems chip', () => {
  it('lists every detected problem, including structural ones', async () => {
    const { handle } = await mountEditor(
      'An [empty]() link.\n\n<!-- never closed\n\n<details>\n\nno close\n'
    );
    const h = host();
    mountProblemsChip(h, handle);
    await settle();

    const chip = h.querySelector('.omd-problems-chip') as HTMLElement;
    expect(chip.textContent).toContain('3'); // compact: count only
    expect(chip.title).toBe('3 issues'); // full phrasing in the tooltip
    // The dropdown list lives on document.body (kept out of the toolbar's flex row).
    const items = [...document.querySelectorAll('.omd-problems-item')].map((i) => i.textContent);
    expect(items.some((t) => t?.includes('Link has no target'))).toBe(true);
    expect(items.some((t) => t?.includes('never closed'))).toBe(true);
    expect(items.some((t) => t?.includes('is never closed'))).toBe(true); // <details>
  });

  it('offers a one-click fix for a bad anchor and applies it to the link', async () => {
    const { handle } = await mountEditor('See [intro](#introducton).\n\n## Introduction\n');
    const h = host();
    mountProblemsChip(h, handle);
    await settle();

    const fix = document.querySelector<HTMLButtonElement>('.omd-problems-fix');
    expect(fix).toBeTruthy();
    expect(fix!.title).toContain('#introduction');
    fix!.click();
    // The link's target is rewritten to the suggested heading anchor.
    expect(handle.getMarkdown()).toContain('[intro](#introduction)');
    expect(handle.getMarkdown()).not.toContain('#introducton');
  });

  it('shows an all-clear state for a clean document', async () => {
    const { handle } = await mountEditor('# Title\n\nAll good here.\n');
    const h = host();
    mountProblemsChip(h, handle);
    await settle();

    const chip = h.querySelector('.omd-problems-chip') as HTMLElement;
    expect(chip.title).toBe('No issues'); // compact: icon only, phrasing in the tooltip
    expect(chip.classList.contains('omd-problems-chip--clean')).toBe(true);
    expect(document.querySelectorAll('.omd-problems-item')).toHaveLength(0);
  });
});
