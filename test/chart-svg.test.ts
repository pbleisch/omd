import { describe, it, expect } from 'vitest';
import { roundTrip } from './helpers/editor';
import { renderChartSvg } from '../src/webview/blocks/chart-svg';
import { CHART_TYPES } from '../src/webview/blocks/chart';

/**
 * The chart preview SVG (#chart-preview): a deterministic, inline SVG embedded in the chart
 * block so renderers that allow inline HTML show the chart, while GitHub still shows the data
 * table. The generator must be byte-deterministic and its output a single CommonMark HTML block,
 * so a chart round-trips byte-for-byte and only real data changes move the bytes.
 */

const twoSeries = {
  labels: ['Q1', 'Q2', 'Q3'],
  series: [
    { label: 'Revenue', data: [120, 150, 170] },
    { label: 'Costs', data: [80, 90, 95] }
  ]
};
const oneSeries = {
  labels: ['North', 'South', 'East', 'West'],
  series: [{ label: 'Share', data: [35, 25, 20, 20] }]
};

describe('renderChartSvg', () => {
  it('is deterministic for every chart type', () => {
    for (const type of CHART_TYPES) {
      const data = type === 'radar' ? twoSeries : oneSeries;
      expect(renderChartSvg(type, data, 'T')).toBe(renderChartSvg(type, data, 'T'));
    }
  });

  it('emits a single CommonMark HTML block (open tag alone, no blank lines, closes with </svg>)', () => {
    for (const type of CHART_TYPES) {
      const svg = renderChartSvg(type, type === 'radar' ? twoSeries : oneSeries, 'T');
      expect(svg).not.toBe('');
      const lines = svg.split('\n');
      expect(lines[0]).toMatch(/^<svg [^>]*>$/); // open tag alone on line 1 → HTML block type 7
      expect(svg.endsWith('</svg>')).toBe(true);
      expect(svg).not.toMatch(/\n\s*\n/); // no blank line would split the block on re-parse
    }
  });

  it('reflects the data (a bar per value) and escapes the title', () => {
    const bar = renderChartSvg('bar', twoSeries, 'A & B <x>');
    expect((bar.match(/<rect class="bar"/g) ?? []).length).toBe(6); // 3 labels × 2 series
    expect(bar).toContain('A &amp; B &lt;x&gt;');
  });

  it('returns empty for no data (so the block shows just the table)', () => {
    expect(renderChartSvg('bar', null, 'T')).toBe('');
    expect(renderChartSvg('bar', { labels: [], series: [] }, 'T')).toBe('');
  });

  it('changing a value changes the SVG (a real, diffable edit)', () => {
    const a = renderChartSvg('bar', twoSeries, 'T');
    const b = renderChartSvg('bar', { ...twoSeries, series: [{ label: 'Revenue', data: [999, 150, 170] }, twoSeries.series[1]] }, 'T');
    expect(a).not.toBe(b);
  });
});

describe('chart block byte-stability with an embedded SVG', () => {
  const chart = (body: string) =>
    ['<!-- omd:chart {"type":"bar","title":"Revenue"} -->', '', body, '<!-- /omd:chart -->', ''].join('\n');
  const table = ['| Quarter | Revenue |', '| ------- | ------- |', '| Q1      | 120     |', ''].join('\n');

  it('a chart without an SVG is left untouched', async () => {
    const md = chart(table);
    expect(await roundTrip(md)).toBe(md);
  });

  it('a chart with an embedded SVG round-trips byte-for-byte', async () => {
    const svg = renderChartSvg('bar', { labels: ['Q1'], series: [{ label: 'Revenue', data: [120] }] }, 'Revenue');
    const md = chart(`${svg}\n\n${table}`);
    expect(await roundTrip(md)).toBe(md);
  });
});
