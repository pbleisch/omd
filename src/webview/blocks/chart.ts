import type { Node as ProseNode } from 'prosemirror-model';

/**
 * The `chart` built-in. Its GFM fallback *is* its data (docs/design/FORMATS.md): the block's body is a
 * real markdown table, so a reader on GitHub sees the numbers while OMD draws them with
 * Chart.js. The table is the single source of truth — the chart is derived from it on every
 * change, and nothing about the rendering is ever serialized.
 */

/** The six chart types the block offers. */
export const CHART_TYPES = ['bar', 'line', 'pie', 'doughnut', 'radar', 'polarArea'] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export function isChartType(v: unknown): v is ChartType {
  return typeof v === 'string' && (CHART_TYPES as readonly string[]).includes(v);
}

export interface ChartData {
  /** Row labels, taken from the first column. */
  labels: string[];
  /** One series per remaining column. */
  series: Array<{ label: string; data: number[] }>;
}

/** The palette used for series/slices — the dataviz accents, kept out of theme variables. */
export const CHART_COLORS = ['#4daafc', '#3fb950', '#d29922', '#a371f7', '#f85149', '#39c5cf'];

function cellText(cell: ProseNode): string {
  return cell.textContent.trim();
}

/** Parse a number the way a spreadsheet would, tolerating `1,234`, `45%`, and `$12`. */
export function parseNumber(text: string): number {
  const cleaned = text.replace(/[,$\s%]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Read the chart's data out of the first table in the block body. The first column supplies
 * the labels and each remaining column becomes a series named by its header. Returns null when
 * there is no usable table, so the block can show a helpful empty state instead of a broken
 * chart.
 */
export function parseChartData(container: ProseNode): ChartData | null {
  let table: ProseNode | null = null;
  container.descendants((node) => {
    if (table) return false;
    if (node.type.name === 'table') {
      table = node;
      return false;
    }
    return true;
  });
  if (!table) return null;

  const rows: ProseNode[] = [];
  (table as ProseNode).forEach((row) => rows.push(row));
  if (rows.length < 2) return null; // need a header and at least one data row

  const headerCells: ProseNode[] = [];
  rows[0].forEach((cell) => headerCells.push(cell));
  if (headerCells.length < 2) return null;

  const seriesNames = headerCells.slice(1).map((c, i) => cellText(c) || `Series ${i + 1}`);
  const labels: string[] = [];
  const series = seriesNames.map((label) => ({ label, data: [] as number[] }));

  for (const row of rows.slice(1)) {
    const cells: ProseNode[] = [];
    row.forEach((cell) => cells.push(cell));
    if (cells.length === 0) continue;
    labels.push(cellText(cells[0]));
    for (let i = 0; i < series.length; i++) {
      series[i].data.push(parseNumber(cells[i + 1] ? cellText(cells[i + 1]) : ''));
    }
  }
  return labels.length ? { labels, series } : null;
}

/** Chart.js dataset config for a type — pie-family charts colour per slice, not per series. */
export function toChartConfig(type: ChartType, data: ChartData, title: string) {
  const perSlice = type === 'pie' || type === 'doughnut' || type === 'polarArea';
  return {
    type,
    data: {
      labels: data.labels,
      datasets: data.series.map((s, i) => ({
        label: s.label,
        data: s.data,
        backgroundColor: perSlice
          ? data.labels.map((_, j) => CHART_COLORS[j % CHART_COLORS.length])
          : CHART_COLORS[i % CHART_COLORS.length],
        borderColor: CHART_COLORS[i % CHART_COLORS.length],
        borderWidth: type === 'line' ? 2 : 1,
        fill: false
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: data.series.length > 1 || perSlice },
        title: { display: Boolean(title), text: title }
      }
    }
  };
}
