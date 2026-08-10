// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import * as esbuild from 'esbuild';
import { mayContainMath, mathRenderer } from '../src/host/math-svg';
import { resolveLang } from '../src/shared/shiki-langs';

/**
 * The heavy feature libraries load on demand (docs/operations/PERFORMANCE.md): mermaid, Shiki and
 * Chart.js as sidecar bundles the webview pulls in when a document actually uses one, MathJax when
 * a document being exported actually has math. These tests are the regression gate — an innocent
 * `import` at the wrong place silently puts megabytes back into every document's load, and nothing
 * else in the suite would notice.
 */

const ROOT = resolve(__dirname, '..');

/** The node_modules packages a bundle pulled in, from esbuild's metafile. */
async function bundledPackages(entry: string): Promise<Set<string>> {
  const built = await esbuild.build({
    entryPoints: [resolve(ROOT, entry)],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2021'],
    write: false,
    metafile: true,
    loader: { '.css': 'text', '.ttf': 'dataurl', '.woff': 'dataurl', '.woff2': 'dataurl' },
    logLevel: 'silent'
  });
  const packages = new Set<string>();
  for (const file of Object.keys(built.metafile.inputs)) {
    const m = file.match(/node_modules\/((?:@[^/]+\/)?[^/]+)\//);
    if (m) packages.add(m[1]);
  }
  return packages;
}

describe('the editor bundle stays free of the on-demand libraries', () => {
  it('bundles neither mermaid, Chart.js, nor the Shiki grammars', async () => {
    const packages = await bundledPackages('src/webview/index.ts');
    // Each of these is loaded at runtime from its own file in media/ instead.
    expect([...packages].filter((p) => p === 'mermaid' || p === '@mermaid-js/parser')).toEqual([]);
    expect(packages.has('chart.js')).toBe(false);
    expect(packages.has('@shikijs/langs')).toBe(false);
    // ...and with mermaid out, so is its heavy transitive graph.
    expect(packages.has('cytoscape')).toBe(false);
  }, 30000);

  it('keeps the preview panel client free of the mermaid runtime', async () => {
    const packages = await bundledPackages('src/panel/index.ts');
    expect(packages.has('mermaid')).toBe(false);
  }, 30000);

  it('still resolves fence languages without loading a single grammar', () => {
    // The alias table is what every code fence consults; it must stay data-free.
    expect(resolveLang('ts')).toBe('typescript');
    expect(resolveLang('zsh')).toBe('bash');
    expect(resolveLang('brainfuck')).toBeNull();
  });
});

describe('MathJax loads only for a document that has math', () => {
  it('recognises a document that provably has none', () => {
    expect(mayContainMath('# Title\n\nJust prose and a `code span`.\n')).toBe(false);
    expect(mayContainMath('Inline $E = mc^2$ here.')).toBe(true);
    expect(mayContainMath('$$\nx^2\n$$')).toBe(true);
  });

  it('gives no renderer for a math-free document', async () => {
    expect(await mathRenderer('# Title\n\nNo math at all.\n')).toBeUndefined();
  });

  it('gives a working renderer when there is math', async () => {
    const render = await mathRenderer('Inline $E = mc^2$.');
    expect(render).toBeTypeOf('function');
    expect(render!('E = mc^2', false)).toContain('<svg');
  }, 30000);

  it('falls back to readable text rather than throwing on bad LaTeX', async () => {
    const render = await mathRenderer('$x$');
    expect(render!('\\begin{unknown}', true)).toContain('<');
  }, 30000);
});
