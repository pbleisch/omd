import { registerIcon } from '../codicons';

/**
 * Custom UI glyphs the codicon font doesn't ship. The alignment marks (left / center / right
 * justify) are the familiar text-align icons — stroked horizontal rules, one row shifted to the
 * chosen edge — used by the media property panel's Align control. They use `stroke="currentColor"`
 * so they stay theme-aware alongside the codicon chrome.
 */

const alignSvg = (lines: Array<[number, number]>): string => {
  const rows = [6, 10, 14, 18];
  const paths = lines
    .map(([x1, x2], i) => `<line x1="${x1}" y1="${rows[i]}" x2="${x2}" y2="${rows[i]}"/>`)
    .join('');
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;
};

const UI_ICONS: Record<string, string> = {
  // Rows 1/3 span full width; rows 2/4 are shorter and pinned to the edge the icon names.
  'align-left': alignSvg([
    [3, 21],
    [3, 15],
    [3, 21],
    [3, 15]
  ]),
  'align-center': alignSvg([
    [3, 21],
    [6, 18],
    [3, 21],
    [6, 18]
  ]),
  'align-right': alignSvg([
    [3, 21],
    [9, 21],
    [3, 21],
    [9, 21]
  ])
};

/** Register the custom UI icons with the codicon factory. Call once at startup. */
export function registerUiIcons(): void {
  for (const [name, svg] of Object.entries(UI_ICONS)) registerIcon(name, svg);
}
