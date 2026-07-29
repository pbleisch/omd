import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseBlockManifest } from '../src/shared/blocks';
import { renderLeafOutput } from '../src/webview/blocks/render';

/**
 * The copy-start example blocks (examples/blocks/**) are contributor-facing documentation, so
 * they have to stay valid. This mirrors the host's discovery step (read block.json, fold a
 * sibling render.js in as `script`) and asserts each manifest parses and lands in the tier the
 * authoring guide promises — a discovered block is never `builtin`, and any render.js forces
 * `sandboxed`. See docs/contributing/AUTHORING-SMART-BLOCKS.md.
 */

const dir = resolve(__dirname, '../examples/blocks');

/** Discovery, as blockDiscovery.ts does it: parse block.json, inject render.js as script. */
function loadExample(name: string) {
  const manifest = JSON.parse(readFileSync(resolve(dir, name, 'block.json'), 'utf8')) as Record<string, unknown>;
  const scriptPath = resolve(dir, name, 'render.js');
  if (existsSync(scriptPath)) manifest.script = readFileSync(scriptPath, 'utf8');
  // Examples are copied into a workspace or user layer — never the shipped set.
  return parseBlockManifest(manifest, 'workspace');
}

const exampleDirs = readdirSync(dir).filter((f) => statSync(resolve(dir, f)).isDirectory());

describe('example blocks', () => {
  it('ships at least the two documented examples', () => {
    expect(exampleDirs).toEqual(expect.arrayContaining(['badge', 'metric']));
  });

  it.each(exampleDirs)('%s has a valid, discoverable manifest', (name) => {
    const def = loadExample(name);
    expect(def, `${name}/block.json failed to parse`).not.toBeNull();
    // A discovered block can never claim editor privileges.
    expect(def!.trust).not.toBe('builtin');
    expect(def!.name).toBe(name);
  });

  it('badge is a template-tier leaf that renders its label', () => {
    const def = loadExample('badge')!;
    expect(def.trust).toBe('template');
    expect(def.kind).toBe('leaf');
    const out = renderLeafOutput(def, def.defaultParams!);
    expect(out?.textContent).toContain('new');
    // The sanitizer must leave no executable nodes behind.
    expect(out?.querySelector('script,iframe,style')).toBeNull();
  });

  it('metric is forced to the sandboxed tier by its render.js', () => {
    const def = loadExample('metric')!;
    expect(def.trust).toBe('sandboxed');
    expect(def.script).toBeTruthy();
    const out = renderLeafOutput(def, def.defaultParams!);
    // Sandboxed output is an isolated iframe host, not inline DOM.
    expect(out?.querySelector('iframe')).not.toBeNull();
  });
});
