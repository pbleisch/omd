import { describe, it, expect } from 'vitest';
import { mountEditor } from './helpers/editor';

/**
 * Heading folding — a chevron per heading collapses its section (up to the next equal-or-higher
 * heading). Decoration-only, so it's DOM-observable in jsdom (classes apply without layout) and
 * never touches the document. A quick round-trip check confirms folding leaves the source alone.
 */

const md = (chev: Element | null | undefined) =>
  chev?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

describe('heading folding', () => {
  it('shows a chevron per heading and folds/unfolds the section', async () => {
    const { root, handle } = await mountEditor('# Title\n\nBody paragraph.\n\n## Sub\n\nMore.\n');
    const source = handle.getMarkdown();
    expect(root.querySelectorAll('.omd-fold-chevron').length).toBe(2);

    md(root.querySelector('h1 .omd-fold-chevron'));
    expect(root.querySelectorAll('.omd-fold-hidden').length).toBeGreaterThan(0); // section hidden

    md(root.querySelector('h1 .omd-fold-chevron')); // re-click unfolds
    expect(root.querySelectorAll('.omd-fold-hidden').length).toBe(0);

    expect(handle.getMarkdown()).toBe(source); // folding never edits the document
  });

  it('stops at a same-or-higher heading', async () => {
    const { root } = await mountEditor('## A\n\nunder A.\n\n## B\n\nunder B.\n');
    md(root.querySelector('h2 .omd-fold-chevron')); // fold "A"
    const headings = [...root.querySelectorAll('h2')];
    // "B" is the same level, so it and its body stay visible.
    expect(headings[1].classList.contains('omd-fold-hidden')).toBe(false);
    expect(headings[1].textContent).toContain('B');
  });
});
