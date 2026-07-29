import { CHART_COLORS, type ChartData, type ChartType } from './chart';

/**
 * A deterministic, compact SVG rendering of a chart, embedded in the block body so renderers
 * that allow inline HTML (VS Code preview, static-site generators, OMD itself) show the chart
 * while GitHub — which strips `<svg>` — still shows the data table beneath it (docs/design/FORMATS.md).
 *
 * Determinism is the whole point: same data + same code ⇒ identical bytes, so regenerating on an
 * unchanged chart is a no-op and diffs stay small and meaningful (a `<rect>` per bar moves by a
 * few units, not a wall of canvas path-soup). No timestamps, no random ids, coordinates rounded.
 *
 * The output is a single CommonMark HTML block: the `<svg …>` open tag alone on the first line,
 * no blank lines inside, `</svg>` last — so remark parses and re-emits it as one `html` node.
 */

const W = 640;
const H = 360;
const LEGEND_H = 24;

/** Round to one decimal and drop a trailing `.0`, so coordinates are stable and terse. */
function n(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? '0' : String(r);
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const color = (i: number): string => CHART_COLORS[i % CHART_COLORS.length];

/** A horizontal, centred legend row at the bottom; items are `{color, label}`. */
function legend(items: Array<{ color: string; label: string }>): string {
  if (items.length <= 1 && items[0]?.label === '') return '';
  const gap = 14;
  const widths = items.map((it) => 16 + it.label.length * 6.2 + gap);
  const total = widths.reduce((a, b) => a + b, 0) - gap;
  let x = (W - total) / 2;
  const y = H - LEGEND_H / 2;
  const parts: string[] = [];
  items.forEach((it, i) => {
    parts.push(`<rect class="sw" x="${n(x)}" y="${n(y - 6)}" width="10" height="10" rx="2" fill="${it.color}"/>`);
    parts.push(`<text class="lbl" x="${n(x + 15)}" y="${n(y + 3)}">${esc(it.label)}</text>`);
    x += widths[i];
  });
  return parts.join('\n');
}

interface Frame {
  left: number;
  right: number;
  top: number;
  bottom: number;
  min: number;
  max: number;
  ticks: number[];
}

/** Axis frame + gridlines + y ticks + x labels for the cartesian charts (bar, line). */
function cartesianFrame(data: ChartData, hasLegend: boolean, hasTitle: boolean): { frame: Frame; svg: string } {
  const left = 46;
  const right = 14;
  const top = hasTitle ? 34 : 14;
  const bottom = (hasLegend ? LEGEND_H : 0) + 26;
  let dMin = 0;
  let dMax = 0;
  for (const s of data.series) for (const v of s.data) {
    if (v < dMin) dMin = v;
    if (v > dMax) dMax = v;
  }
  if (dMax === dMin) dMax = dMin + 1;
  const steps = 4;
  const ticks = Array.from({ length: steps + 1 }, (_, i) => dMin + ((dMax - dMin) * i) / steps);
  const plotTop = top;
  const plotBottom = H - bottom;
  const yOf = (v: number) => plotTop + (plotBottom - plotTop) * (1 - (v - dMin) / (dMax - dMin));
  const parts: string[] = [];
  for (const t of ticks) {
    const y = yOf(t);
    parts.push(`<line class="grid" x1="${left}" y1="${n(y)}" x2="${W - right}" y2="${n(y)}"/>`);
    parts.push(`<text class="tick" x="${left - 6}" y="${n(y + 3)}" text-anchor="end">${esc(n(t))}</text>`);
  }
  const band = (W - right - left) / data.labels.length;
  data.labels.forEach((lab, i) => {
    const x = left + band * (i + 0.5);
    parts.push(`<text class="tick" x="${n(x)}" y="${n(plotBottom + 16)}" text-anchor="middle">${esc(lab)}</text>`);
  });
  return { frame: { left, right, top, bottom, min: dMin, max: dMax, ticks }, svg: parts.join('\n') };
}

function barChart(data: ChartData, hasTitle: boolean): string {
  const { frame, svg } = cartesianFrame(data, data.series.length > 1, hasTitle);
  const plotTop = frame.top;
  const plotBottom = H - frame.bottom;
  const yOf = (v: number) => plotTop + (plotBottom - plotTop) * (1 - (v - frame.min) / (frame.max - frame.min));
  const y0 = yOf(0);
  const band = (W - frame.right - frame.left) / data.labels.length;
  const groupW = band * 0.7;
  const barW = groupW / data.series.length;
  const bars: string[] = [];
  data.labels.forEach((_, i) => {
    const gx = frame.left + band * i + (band - groupW) / 2;
    data.series.forEach((s, j) => {
      const v = s.data[i] ?? 0;
      const y = yOf(v);
      const top = Math.min(y, y0);
      const height = Math.abs(y - y0);
      bars.push(
        `<rect class="bar" x="${n(gx + barW * j)}" y="${n(top)}" width="${n(barW - 1)}" height="${n(height)}" fill="${color(j)}"/>`
      );
    });
  });
  return [svg, bars.join('\n'), legend(data.series.map((s, i) => ({ color: color(i), label: s.label })))]
    .filter(Boolean)
    .join('\n');
}

function lineChart(data: ChartData, hasTitle: boolean): string {
  const { frame, svg } = cartesianFrame(data, data.series.length > 1, hasTitle);
  const plotTop = frame.top;
  const plotBottom = H - frame.bottom;
  const yOf = (v: number) => plotTop + (plotBottom - plotTop) * (1 - (v - frame.min) / (frame.max - frame.min));
  const band = (W - frame.right - frame.left) / data.labels.length;
  const xOf = (i: number) => frame.left + band * (i + 0.5);
  const lines: string[] = [];
  data.series.forEach((s, j) => {
    const pts = data.labels.map((_, i) => `${n(xOf(i))},${n(yOf(s.data[i] ?? 0))}`).join(' ');
    lines.push(`<polyline class="line" points="${pts}" fill="none" stroke="${color(j)}" stroke-width="2"/>`);
    data.labels.forEach((_, i) => {
      lines.push(`<circle class="pt" cx="${n(xOf(i))}" cy="${n(yOf(s.data[i] ?? 0))}" r="2.5" fill="${color(j)}"/>`);
    });
  });
  return [svg, lines.join('\n'), legend(data.series.map((s, i) => ({ color: color(i), label: s.label })))]
    .filter(Boolean)
    .join('\n');
}

/** SVG arc path for a slice from `a0` to `a1` (radians), optionally a doughnut ring. */
function slicePath(cx: number, cy: number, r: number, a0: number, a1: number, inner: number): string {
  const p = (radius: number, a: number) => `${n(cx + radius * Math.cos(a))} ${n(cy + radius * Math.sin(a))}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  if (inner <= 0) {
    return `M ${n(cx)} ${n(cy)} L ${p(r, a0)} A ${n(r)} ${n(r)} 0 ${large} 1 ${p(r, a1)} Z`;
  }
  return `M ${p(r, a0)} A ${n(r)} ${n(r)} 0 ${large} 1 ${p(r, a1)} L ${p(inner, a1)} A ${n(inner)} ${n(inner)} 0 ${large} 0 ${p(inner, a0)} Z`;
}

/** Vertical centre and max radius for a round chart, reserving room for title and legend. */
function radial(hasTitle: boolean, margin: number): { cx: number; cy: number; r: number } {
  const top = hasTitle ? 28 : 8;
  const cx = W / 2;
  const cy = (top + (H - LEGEND_H)) / 2;
  const r = Math.min(cx, (H - LEGEND_H - top) / 2) - margin;
  return { cx, cy, r };
}

function pieChart(data: ChartData, doughnut: boolean, hasTitle: boolean): string {
  const series = data.series[0];
  if (!series) return '';
  const { cx, cy, r } = radial(hasTitle, 12);
  const inner = doughnut ? r * 0.55 : 0;
  const total = series.data.reduce((a, b) => a + Math.max(0, b), 0) || 1;
  let a = -Math.PI / 2;
  const slices: string[] = [];
  data.labels.forEach((_, i) => {
    const frac = Math.max(0, series.data[i] ?? 0) / total;
    const a1 = a + frac * Math.PI * 2;
    slices.push(`<path class="slice" d="${slicePath(cx, cy, r, a, a1, inner)}" fill="${color(i)}"/>`);
    a = a1;
  });
  return [slices.join('\n'), legend(data.labels.map((lab, i) => ({ color: color(i), label: lab })))]
    .filter(Boolean)
    .join('\n');
}

function polarChart(data: ChartData, hasTitle: boolean): string {
  const series = data.series[0];
  if (!series) return '';
  const { cx, cy, r: rMax } = radial(hasTitle, 12);
  const vMax = Math.max(1, ...series.data.map((v) => Math.max(0, v)));
  const step = (Math.PI * 2) / data.labels.length;
  let a = -Math.PI / 2;
  const parts: string[] = [];
  for (let ring = 1; ring <= 4; ring++) {
    parts.push(`<circle class="grid" cx="${n(cx)}" cy="${n(cy)}" r="${n((rMax * ring) / 4)}" fill="none"/>`);
  }
  data.labels.forEach((_, i) => {
    const r = (Math.max(0, series.data[i] ?? 0) / vMax) * rMax;
    parts.push(`<path class="slice" d="${slicePath(cx, cy, r, a, a + step, 0)}" fill="${color(i)}" fill-opacity="0.75"/>`);
    a += step;
  });
  return [parts.join('\n'), legend(data.labels.map((lab, i) => ({ color: color(i), label: lab })))]
    .filter(Boolean)
    .join('\n');
}

function radarChart(data: ChartData, hasTitle: boolean): string {
  const { cx, cy, r: rMax } = radial(hasTitle, 18);
  const axes = data.labels.length;
  if (axes < 3) return '';
  let vMax = 1;
  for (const s of data.series) for (const v of s.data) vMax = Math.max(vMax, v);
  const step = (Math.PI * 2) / axes;
  const at = (i: number, radius: number): [number, number] => {
    const a = -Math.PI / 2 + step * i;
    return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
  };
  const parts: string[] = [];
  for (let ring = 1; ring <= 4; ring++) {
    const pts = data.labels.map((_, i) => at(i, (rMax * ring) / 4).map(n).join(',')).join(' ');
    parts.push(`<polygon class="grid" points="${pts}" fill="none"/>`);
  }
  data.labels.forEach((lab, i) => {
    const [x, y] = at(i, rMax + 8);
    parts.push(`<text class="tick" x="${n(x)}" y="${n(y)}" text-anchor="middle">${esc(lab)}</text>`);
  });
  data.series.forEach((s, j) => {
    const pts = data.labels.map((_, i) => at(i, ((s.data[i] ?? 0) / vMax) * rMax).map(n).join(',')).join(' ');
    parts.push(`<polygon class="area" points="${pts}" fill="${color(j)}" fill-opacity="0.2" stroke="${color(j)}" stroke-width="2"/>`);
  });
  return [parts.join('\n'), legend(data.series.map((s, i) => ({ color: color(i), label: s.label })))]
    .filter(Boolean)
    .join('\n');
}

const STYLE =
  '.grid{stroke:#d0d7de}.tick,.lbl{fill:#57606a;font:11px sans-serif}.title{fill:#1f2328;font:600 14px sans-serif}' +
  '@media(prefers-color-scheme:dark){.grid{stroke:#30363d}.tick,.lbl{fill:#8b949e}.title{fill:#e6edf3}}';

/**
 * Render a chart to a single-HTML-block SVG string, or `''` when there's nothing to draw. The
 * result is embedded verbatim in the chart block body and round-trips byte-for-byte.
 */
export function renderChartSvg(type: ChartType, data: ChartData | null, title: string): string {
  if (!data || !data.labels.length || !data.series.length) return '';
  const hasTitle = Boolean(title);
  let body: string;
  switch (type) {
    case 'line':
      body = lineChart(data, hasTitle);
      break;
    case 'pie':
      body = pieChart(data, false, hasTitle);
      break;
    case 'doughnut':
      body = pieChart(data, true, hasTitle);
      break;
    case 'polarArea':
      body = polarChart(data, hasTitle);
      break;
    case 'radar':
      body = radarChart(data, hasTitle);
      break;
    case 'bar':
    default:
      body = barChart(data, hasTitle);
      break;
  }
  if (!body) return '';
  const titleSvg = hasTitle ? `<text class="title" x="${W / 2}" y="20" text-anchor="middle">${esc(title)}</text>` : '';
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(title || type + ' chart')}">`,
    `<style>${STYLE}</style>`,
    titleSvg,
    body,
    '</svg>'
  ]
    .filter(Boolean)
    .join('\n');
}
