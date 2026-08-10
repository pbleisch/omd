import type * as ChartSidecar from '../lazy/chart';
import { loadGlobal } from '../lazy/sidecar';

/**
 * Chart.js, loaded on demand. Only a document with a chart block pays for it — a chart is a
 * derived view over the block's data table (docs/design/SMART-BLOCKS.md), and the table itself
 * renders with no runtime at all, so nothing is missing while this loads.
 */
declare global {
  interface Window {
    /** Set by `media/omd-chart.js`. */
    omdChart?: typeof ChartSidecar;
  }
}

/** The Chart constructor, fetching `media/omd-chart.js` on first use. */
export async function loadChart(): Promise<typeof ChartSidecar.Chart> {
  const sidecar = await loadGlobal('omd-chart.js', () => window.omdChart);
  return sidecar.Chart;
}
