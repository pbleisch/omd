import { describe, it, expect, afterEach } from 'vitest';
import { resolveDateInput, formatDateToken, toIsoDate } from '../src/webview/blocks/date';
import { dateTokenAt, setDateAt, createDatePicker } from '../src/webview/plugins/date-token';
import {
  pairDetails,
  summaryOf,
  isOpenByDefault
} from '../src/webview/plugins/collapsible/transform';
import type { MdNode } from '../src/webview/plugins/shortcode/transform';
import { roundTrip, mountEditor } from './helpers/editor';
import { normalizeMarkdown } from '../src/shared/roundtrip';

/**
 * P5: the `date` and `collapsible` built-ins. Both are *native* constructs — a bare
 * `📅 YYYY-MM-DD` token and a real `<details>` — so a plain reader sees the same thing OMD
 * does, and neither writes machinery (docs/design/FORMATS.md).
 */

// A fixed "now" so the relative-date tests never depend on the day they run.
const NOW = new Date(2026, 6, 23); // 2026-07-23, local time

describe('date: relative input resolved on insert', () => {
  const cases: Array<[string, string | null]> = [
    ['', '2026-07-23'],
    ['today', '2026-07-23'],
    ['tomorrow', '2026-07-24'],
    ['yesterday', '2026-07-22'],
    ['+7d', '2026-07-30'],
    ['-2w', '2026-07-09'],
    ['+1m', '2026-08-23'],
    ['+1y', '2027-07-23'],
    ['2026-01-02', '2026-01-02'],
    ['2026-02-31', null], // impossible date must not silently roll over
    ['next tuesday', null]
  ];
  for (const [input, expected] of cases) {
    it(`${input || '(empty)'} → ${expected ?? 'null'}`, () => {
      expect(resolveDateInput(input, NOW)).toBe(expected);
    });
  }

  it('formats the on-disk token and is timezone-stable', () => {
    expect(formatDateToken('2026-07-23')).toBe('📅 2026-07-23');
    expect(toIsoDate(NOW)).toBe('2026-07-23');
  });

  it('the bare token round-trips as plain text', async () => {
    const md = 'Due 📅 2026-07-23 for review.\n';
    expect(normalizeMarkdown(await roundTrip(md))).toBe(normalizeMarkdown(md));
  });
});

describe('date: click-to-pick locates and rewrites the token', () => {
  it('finds the token spanning a position and ignores positions outside it', async () => {
    const { handle } = await mountEditor('Due 📅 2026-07-23 today.\n');
    const doc = handle.getView().state.doc;
    // "Due " is 4 chars, then the token; the emoji 📅 is a surrogate pair (2 code units).
    const from = 1 + 4; // +1 for the paragraph's opening position
    const to = from + '📅 2026-07-23'.length;

    const inside = dateTokenAt(doc, from + 3);
    expect(inside).toEqual({ from, to, iso: '2026-07-23' });
    // the boundaries are inclusive (a click on either edge still hits the chip)
    expect(dateTokenAt(doc, from)).toEqual(inside);
    expect(dateTokenAt(doc, to)).toEqual(inside);
    // a position in the surrounding prose is not on the token
    expect(dateTokenAt(doc, 1)).toBeNull();
    expect(dateTokenAt(doc, to + 2)).toBeNull();
  });

  it('replaces the token in place with the picked date, leaving prose intact', async () => {
    const { handle } = await mountEditor('Due 📅 2026-07-23 today.\n');
    const view = handle.getView();
    const token = dateTokenAt(view.state.doc, 6)!;
    view.dispatch(setDateAt(view.state, token.from, token.to, '2026-08-01'));
    expect(view.state.doc.textContent).toBe('Due 📅 2026-08-01 today.');
  });
});

describe('date: calendar popover', () => {
  const rect = { left: 10, bottom: 20, top: 10 };
  afterEach(() => {
    document.querySelectorAll('.omd-date-picker').forEach((n) => n.remove());
  });

  it('opens on the selected month with the selected day marked', () => {
    createDatePicker(rect, '2026-07-23', () => {});
    const pop = document.querySelector('.omd-date-picker')!;
    expect(pop.querySelector('.omd-date-picker-label')!.textContent).toBe('July 2026');
    expect(pop.querySelector('.omd-date-picker-day.is-selected')!.textContent).toBe('23');
  });

  it('picking a day reports its ISO date and closes the popover', () => {
    let picked: string | null = null;
    createDatePicker(rect, '2026-07-23', (iso) => (picked = iso));
    const days = document.querySelectorAll<HTMLButtonElement>('.omd-date-picker-day');
    days[0].click(); // July 1
    expect(picked).toBe('2026-07-01');
    expect(document.querySelector('.omd-date-picker')).toBeNull();
  });

  it('navigates to the next month and only one popover exists at a time', () => {
    createDatePicker(rect, '2026-07-23', () => {});
    (document.querySelector('[aria-label="Next month"]') as HTMLButtonElement).click();
    expect(document.querySelector('.omd-date-picker-label')!.textContent).toBe('August 2026');
    // a second open replaces the first
    createDatePicker(rect, '2026-01-01', () => {});
    expect(document.querySelectorAll('.omd-date-picker')).toHaveLength(1);
    expect(document.querySelector('.omd-date-picker-label')!.textContent).toBe('January 2026');
  });

  it('Escape closes the popover', () => {
    createDatePicker(rect, '2026-07-23', () => {});
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.omd-date-picker')).toBeNull();
  });
});

describe('collapsible: native <details>', () => {
  const html = (v: string): MdNode => ({ type: 'html', value: v });
  const para = (t: string): MdNode => ({ type: 'paragraph', children: [{ type: 'text', value: t }] });

  it('extracts the summary and open state from the opener', () => {
    expect(summaryOf('<details>\n<summary>Design notes</summary>')).toBe('Design notes');
    expect(isOpenByDefault('<details open>')).toBe(true);
    expect(isOpenByDefault('<details>')).toBe(false);
  });

  it('pairs an opener with its </details>', () => {
    const out = pairDetails([html('<details>\n<summary>S</summary>'), para('body'), html('</details>')]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: 'omdDetails', summary: 'S' });
  });

  it('balances nested details', () => {
    const out = pairDetails([
      html('<details>'),
      html('<details>'),
      para('inner'),
      html('</details>'),
      html('</details>')
    ]);
    expect(out).toHaveLength(1);
    expect((out[0].children as MdNode[])[0]).toMatchObject({ type: 'omdDetails' });
  });

  it('leaves an unclosed <details> alone', () => {
    const nodes = [html('<details>'), para('x')];
    expect(pairDetails(nodes)).toEqual(nodes);
  });

  it('becomes a details node carrying its summary', async () => {
    const { handle } = await mountEditor(
      '<details>\n<summary>Design notes</summary>\n\nBody.\n\n</details>\n'
    );
    const first = handle.getView().state.doc.child(0);
    expect(first.type.name).toBe('details');
    expect(first.attrs.summary).toBe('Design notes');
  });

  const roundTripCases: Array<[string, string]> = [
    [
      'with summary',
      '<details>\n<summary>Design notes</summary>\n\nBody **markdown**.\n\n</details>\n'
    ],
    ['without summary', '<details>\n\nJust a body.\n\n</details>\n'],
    ['open by default', '<details open>\n<summary>Shown</summary>\n\nBody.\n\n</details>\n']
  ];
  for (const [name, md] of roundTripCases) {
    it(`round-trips ${name}`, async () => {
      expect(normalizeMarkdown(await roundTrip(md))).toBe(normalizeMarkdown(md));
    });
  }
});
