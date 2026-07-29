import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { copyFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

/**
 * Copy runtime assets the *host* reads at export time into `media/` (which ships in the .vsix;
 * `node_modules` does not). Without this the packaged export can't find github-markdown-css or the
 * mermaid runtime and silently degrades. Done once, up front, for both watch and one-shot builds.
 */
function copyHostAssets() {
  const R = (p) => resolve(__dirname, p);
  copyFileSync(R('node_modules/github-markdown-css/github-markdown.css'), R('media/github-markdown.css'));
  copyFileSync(R('node_modules/mermaid/dist/mermaid.min.js'), R('media/mermaid.min.js'));
  console.log('[omd] copied host assets → media/ (github-markdown.css, mermaid.min.js)');
}
copyHostAssets();
// Minify production builds (not watch) — shrinks the shipped bundles and speeds webview parse/eval.
const minify = !watch;

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: [resolve(__dirname, 'src/webview/index.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2021'],
  outfile: resolve(__dirname, 'media/webview.js'),
  sourcemap: true,
  minify,
  // CSS-as-text: plugins carry their styles as strings the surface concatenates
  // into a single stylesheet (docs/design/DECISIONS.md). `.css` imports resolve to strings.
  loader: {
    '.css': 'text',
    '.ttf': 'dataurl',
    '.woff': 'dataurl',
    '.woff2': 'dataurl'
  },
  logLevel: 'info'
};

/** Preview-harness fixture (real SHIPPED_BLOCKS + a sample) for test/preview/index.html. */
const fixtureOptions = {
  ...options,
  entryPoints: [resolve(__dirname, 'test/preview/fixture.ts')],
  outfile: resolve(__dirname, 'test/preview/fixture.js'),
  sourcemap: false
};

/** The GitHub-preview panel client (renders mermaid; the host sends the HTML). */
const panelOptions = {
  ...options,
  entryPoints: [resolve(__dirname, 'src/panel/index.ts')],
  outfile: resolve(__dirname, 'media/panel.js')
};

/**
 * The extension host, bundled to a single CommonJS file so the packaged .vsix ships no
 * node_modules (the whole dependency tree is baked in here, ~200 MB → a few MB). `vscode` is the
 * one external — it's provided by the runtime, not npm. `main` in package.json points at this file.
 */
const hostOptions = {
  entryPoints: [resolve(__dirname, 'src/host/extension.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: ['node18'],
  outfile: resolve(__dirname, 'dist/extension.js'),
  external: ['vscode'],
  sourcemap: true,
  minify,
  logLevel: 'info'
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  const fixtureCtx = await esbuild.context(fixtureOptions);
  await fixtureCtx.watch();
  const panelCtx = await esbuild.context(panelOptions);
  await panelCtx.watch();
  const hostCtx = await esbuild.context(hostOptions);
  await hostCtx.watch();
  console.log('[omd] webview + panel + host watch started');
} else {
  await esbuild.build(options);
  await esbuild.build(fixtureOptions);
  await esbuild.build(panelOptions);
  await esbuild.build(hostOptions);
}
