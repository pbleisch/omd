import { describe, it, expect } from 'vitest';
import {
  parseChartData,
  parseNumber,
  toChartConfig,
  isChartType,
  CHART_TYPES
} from '../src/webview/blocks/chart';
import { mountEditor, roundTrip } from './helpers/editor';
import { normalizeMarkdown } from '../src/shared/roundtrip';
import { setBlocks } from '../src/webview/blocks/registry';
import { blockInsertCommands } from '../src/webview/blocks/insert';
import { SHIPPED_BLOCKS } from '../src/shared/blocks';

/**
 * P5 `chart`. The block's body is a real GFM table — the chart's data *and* the fallback a
 * reader sees on GitHub (docs/design/FORMATS.md). The chart is derived from that table on every
 * change and is never serialized, so the file only ever holds the shortcode and the table.
 */

const chartDoc = (type = 'bar') =>
  [
    `<!-- omd:chart {"type":"${type}","title":"Revenue"} -->`,
    '',
    '| Quarter | Revenue | Costs |',
    '| --- | --- | --- |',
    '| Q1 | 120 | 80 |',
    '| Q2 | 150 | 90 |',
    '',
    '<!-- /omd:chart -->',
    ''
  ].join('\n');

describe('chart number parsing', () => {
  it('tolerates spreadsheet-style formatting', () => {
    expect(parseNumber('1,234')).toBe(1234);
    expect(parseNumber('$12')).toBe(12);
    expect(parseNumber('45%')).toBe(45);
    expect(parseNumber(' 7 ')).toBe(7);
  });
  it('falls back to 0 for junk rather than NaN', () => {
    expect(parseNumber('n/a')).toBe(0);
    expect(parseNumber('')).toBe(0);
  });
});

describe('chart data from the body table', () => {
  it('reads labels from the first column and a series per remaining column', async () => {
    const { handle } = await mountEditor(chartDoc());
    const container = handle.getView().state.doc.child(0);
    const data = parseChartData(container);
    expect(data).toBeTruthy();
    expect(data!.labels).toEqual(['Q1', 'Q2']);
    expect(data!.series.map((s) => s.label)).toEqual(['Revenue', 'Costs']);
    expect(data!.series[0].data).toEqual([120, 150]);
    expect(data!.series[1].data).toEqual([80, 90]);
  });

  it('returns null when there is no usable table', async () => {
    const md = '<!-- omd:chart {"type":"bar"} -->\n\nNo table here.\n\n<!-- /omd:chart -->\n';
    const { handle } = await mountEditor(md);
    expect(parseChartData(handle.getView().state.doc.child(0))).toBeNull();
  });
});

describe('chart config', () => {
  const data = { labels: ['a', 'b'], series: [{ label: 'S', data: [1, 2] }] };

  it('accepts exactly the six offered types', () => {
    expect(CHART_TYPES).toHaveLength(6);
    for (const t of CHART_TYPES) expect(isChartType(t)).toBe(true);
    expect(isChartType('bogus')).toBe(false);
  });

  it('colours pie-family charts per slice and others per series', () => {
    const pie = toChartConfig('pie', data, 'T');
    expect(Array.isArray(pie.data.datasets[0].backgroundColor)).toBe(true);
    const bar = toChartConfig('bar', data, 'T');
    expect(Array.isArray(bar.data.datasets[0].backgroundColor)).toBe(false);
  });

  it('shows the title only when there is one', () => {
    expect(toChartConfig('bar', data, 'T').options.plugins.title.display).toBe(true);
    expect(toChartConfig('bar', data, '').options.plugins.title.display).toBe(false);
  });
});

describe('chart round-trip', () => {
  for (const type of ['bar', 'line', 'pie'] as const) {
    it(`${type} chart round-trips with its data table`, async () => {
      const md = chartDoc(type);
      expect(normalizeMarkdown(await roundTrip(md))).toBe(normalizeMarkdown(md));
    });
  }

  it('keeps the rendered chart out of the file', async () => {
    const out = await roundTrip(chartDoc());
    expect(out).not.toContain('canvas');
    // remark-gfm pads cells to the column width; normalizing makes the comparison
    // padding-agnostic, the same way the host's loop guard does.
    expect(normalizeMarkdown(out)).toContain('| Q1 | 120 | 80 |');
  });

  it('inserts a starter table that is valid GFM and round-trips', async () => {
    const { handle } = await mountEditor('start\n');
    setBlocks(SHIPPED_BLOCKS);
    const view = handle.getView();
    blockInsertCommands(view.state.schema).find((c) => c.id === 'block-chart')!.run(view);

    const out = normalizeMarkdown(handle.getMarkdown());
    expect(out).toContain('<!-- omd:chart');
    expect(out).toContain('| Label | Value |');
    expect(normalizeMarkdown(await roundTrip(out))).toBe(out);
  });
});
