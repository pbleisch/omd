import Chart from 'chart.js/auto';

/**
 * The Chart.js sidecar: the auto-registering build bundled on its own (`esbuild.mjs` →
 * `media/omd-chart.js`, global `omdChart`) and loaded only when a document has a chart block
 * to draw (`webview/plugins/shortcode/view.ts`).
 */
export { Chart };
