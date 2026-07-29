import { describe, it, expect } from 'vitest';
import { mountEditor } from './helpers/editor';
import { findMatches, buildQueryRegex, expandReplacement } from '../src/webview/plugins/find/engine';
import { openFind, closeFind } from '../src/webview/plugins/find/find-plugin';
import { normalizeMarkdown } from '../src/shared/roundtrip';

/**
 * Phase 4: Find & Replace. The pure engine is tested directly (matching rules, regex,
 * case); the plugin is driven through the same imperative commands the bar and keymap call,
 * asserting the search state and that replacements round-trip to plain markdown.
 */

async function docOf(markdown: string) {
  const { handle } = await mountEditor(markdown);
  return handle.getView().state.doc;
}

describe('find engine', () => {
  it('finds all case-insensitive matches by default', async () => {
    const doc = await docOf('The cat sat on the CAT mat.\n');
    const matches = findMatches(doc, 'cat', { caseSensitive: false, regex: false });
    expect(matches.length).toBe(2);
  });

  it('respects case sensitivity', async () => {
    const doc = await docOf('The cat sat on the CAT mat.\n');
    expect(findMatches(doc, 'CAT', { caseSensitive: true, regex: false }).length).toBe(1);
  });

  it('does not match across a paragraph boundary', async () => {
    const doc = await docOf('one two\n\nthree\n');
    // "two three" would only match if search crossed the block boundary — it must not.
    expect(findMatches(doc, 'two three', { caseSensitive: false, regex: false }).length).toBe(0);
  });

  it('supports regex mode and treats the query literally otherwise', async () => {
    const doc = await docOf('a1 b2 c3\n');
    expect(findMatches(doc, '[a-c]\\d', { caseSensitive: false, regex: true }).length).toBe(3);
    // Literal mode: the same string matches nothing (no literal "[a-c]\d").
    expect(findMatches(doc, '[a-c]\\d', { caseSensitive: false, regex: false }).length).toBe(0);
  });

  it('returns null regex for empty or invalid patterns', () => {
    expect(buildQueryRegex('', { caseSensitive: false, regex: false })).toBeNull();
    expect(buildQueryRegex('(', { caseSensitive: false, regex: true })).toBeNull();
  });

  it('expands regex capture groups in the replacement', () => {
    // Swap "First Last" -> "Last, First" using $1/$2.
    const out = expandReplacement('Ada Lovelace', '(\\w+) (\\w+)', { caseSensitive: false, regex: true }, '$2, $1');
    expect(out).toBe('Lovelace, Ada');
    // $& is the whole match; $$ is a literal dollar.
    expect(expandReplacement('cat', 'cat', { caseSensitive: false, regex: true }, '[$&]')).toBe('[cat]');
    // In literal mode the replacement is verbatim (no $ expansion).
    expect(expandReplacement('cat', 'cat', { caseSensitive: false, regex: false }, '$1')).toBe('$1');
  });

  it('maps a match to correct document positions', async () => {
    const doc = await docOf('hello world\n');
    const [m] = findMatches(doc, 'world', { caseSensitive: false, regex: false });
    // "world" starts at doc position 7 (1 for the opening paragraph token + offset 6).
    expect(doc.textBetween(m.from, m.to)).toBe('world');
  });
});

describe('find plugin', () => {
  it('opens seeded from the selection and reports the match count', async () => {
    const { handle } = await mountEditor('alpha beta alpha\n');
    const view = handle.getView();
    // Select the first "alpha".
    view.dispatch(view.state.tr.setSelection(
      // TextSelection over positions 1..6
      (await import('prosemirror-state')).TextSelection.create(view.state.doc, 1, 6)
    ));
    openFind(view);
    // Each mounted editor appends its own bar; the active one is the most recent.
    const bars = document.querySelectorAll('.omd-find-bar');
    const bar = bars[bars.length - 1] as HTMLElement;
    expect(bar.style.display).not.toBe('none');
    expect(bar.querySelector('.omd-find-input')).toBeTruthy();
    // The bar shows both matches of the seeded query.
    expect(bar.querySelector('.omd-find-count')?.textContent).toMatch(/of 2/);
    closeFind(view);
  });

  it('replaces all matches through the bar and round-trips', async () => {
    const { handle } = await mountEditor('red fish, red fish\n');
    const view = handle.getView();
    openFind(view);
    const bars = document.querySelectorAll('.omd-find-bar');
    const bar = bars[bars.length - 1] as HTMLElement;
    const [findInput, replaceInput] = bar.querySelectorAll<HTMLInputElement>('.omd-find-input');

    findInput.value = 'red';
    findInput.dispatchEvent(new Event('input', { bubbles: true }));
    replaceInput.value = 'blue';

    const allBtn = [...bar.querySelectorAll('button')].find((b) => b.textContent === 'All')!;
    allBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(normalizeMarkdown(handle.getMarkdown())).toBe('blue fish, blue fish\n');
    closeFind(view);
  });

  it('replaces with regex capture groups through the bar', async () => {
    const { handle } = await mountEditor('Ada Lovelace, Alan Turing\n');
    const view = handle.getView();
    openFind(view);
    const bars = document.querySelectorAll('.omd-find-bar');
    const bar = bars[bars.length - 1] as HTMLElement;
    const [findInput, replaceInput] = bar.querySelectorAll<HTMLInputElement>('.omd-find-input');

    // Enable regex mode.
    bar.querySelector<HTMLButtonElement>('button[title="Regular expression"]')!.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true })
    );
    findInput.value = '(\\w+) (\\w+)';
    findInput.dispatchEvent(new Event('input', { bubbles: true }));
    replaceInput.value = '$2, $1';

    [...bar.querySelectorAll('button')].find((b) => b.textContent === 'All')!.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true })
    );

    expect(normalizeMarkdown(handle.getMarkdown())).toBe('Lovelace, Ada, Turing, Alan\n');
    closeFind(view);
  });

  it('finds text in an inactive tab and reveals it on navigation', async () => {
    const md = [
      '<!-- omd:tabs {} -->',
      '',
      '<!-- omd:tab {"label":"One"} -->',
      '',
      'alpha',
      '',
      '<!-- /omd:tab -->',
      '',
      '<!-- omd:tab {"label":"Two"} -->',
      '',
      'hidden target',
      '',
      '<!-- /omd:tab -->',
      '',
      '<!-- /omd:tabs -->',
      ''
    ].join('\n');
    const { root, handle } = await mountEditor(md);
    const view = handle.getView();
    const tabs = root.querySelector<HTMLElement>('.omd-tabs')!;
    expect(tabs.dataset.active).toBe('0'); // second tab starts hidden

    openFind(view);
    const bars = document.querySelectorAll('.omd-find-bar');
    const bar = bars[bars.length - 1] as HTMLElement;
    const findInput = bar.querySelector<HTMLInputElement>('.omd-find-input')!;
    findInput.value = 'target';
    findInput.dispatchEvent(new Event('input', { bubbles: true }));

    // The match in the inactive tab is counted even though it isn't visible.
    expect(bar.querySelector('.omd-find-count')?.textContent).toMatch(/of 1/);

    // Navigating to it switches to the tab that holds it.
    const nextBtn = [...bar.querySelectorAll('button')].find((b) => b.title.startsWith('Next'))!;
    nextBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(tabs.dataset.active).toBe('1');
    closeFind(view);
  });
});
