import { describe, it, expect } from 'vitest';
import {
  parseBlockManifest,
  resolveBlocks,
  SHIPPED_BLOCKS,
  type BlockDefinition
} from '../src/shared/blocks';
import { mountEditor } from './helpers/editor';
import { setBlocks } from '../src/webview/blocks/registry';
import { blockInsertCommands } from '../src/webview/blocks/insert';
import { normalizeMarkdown } from '../src/shared/roundtrip';

/**
 * P4 three-layer discovery (docs/design/DECISIONS.md). The pure model is tested directly; the
 * insert path is driven through a live editor so a discovered block writes a real,
 * round-tripping shortcode — the same commands the slash menu runs.
 */

describe('block manifest parsing', () => {
  it('accepts a minimal valid manifest and defaults optional fields', () => {
    const def = parseBlockManifest({ name: 'x', kind: 'leaf' }, 'workspace');
    expect(def).toMatchObject({ name: 'x', title: 'x', kind: 'leaf', trust: 'template', source: 'workspace' });
    expect(def?.defaultParams).toEqual({});
  });

  it('rejects bad names and missing/invalid kind', () => {
    expect(parseBlockManifest({ name: 'Bad Name', kind: 'leaf' }, 'user')).toBeNull();
    expect(parseBlockManifest({ name: 'x' }, 'user')).toBeNull();
    expect(parseBlockManifest({ name: 'x', kind: 'nope' }, 'user')).toBeNull();
    expect(parseBlockManifest(null, 'user')).toBeNull();
  });

  it('parses typed param definitions and drops malformed entries', () => {
    const def = parseBlockManifest(
      {
        name: 'x',
        kind: 'container',
        params: [
          { name: 'title', type: 'string', label: 'Title' },
          { name: 'kind', type: 'enum', options: ['a', 'b', 3], default: 'a' },
          { name: 'noType' }, // dropped: no valid type
          { type: 'string' }, // dropped: no name
          { name: 'bad', type: 'widget' } // dropped: unknown type
        ]
      },
      'workspace'
    );
    expect(def?.params).toEqual([
      { name: 'title', label: 'Title', type: 'string', default: undefined, options: undefined },
      { name: 'kind', label: undefined, type: 'enum', default: 'a', options: ['a', 'b'] }
    ]);
  });

  it('leaves params undefined when the manifest declares none', () => {
    expect(parseBlockManifest({ name: 'x', kind: 'leaf' }, 'user')?.params).toBeUndefined();
  });

  it('forces sandboxed trust on any discovered block carrying author code', () => {
    expect(parseBlockManifest({ name: 'x', kind: 'leaf', script: 'root.textContent=1' }, 'workspace')?.trust).toBe(
      'sandboxed'
    );
    // Even if the manifest lies and claims a higher tier, a script can't escape the sandbox.
    expect(
      parseBlockManifest({ name: 'x', kind: 'leaf', script: 'x', trust: 'builtin' }, 'user')?.trust
    ).toBe('sandboxed');
  });

  it('never grants builtin trust to a discovered (non-shipped) block', () => {
    expect(parseBlockManifest({ name: 'x', kind: 'leaf', trust: 'builtin' }, 'workspace')?.trust).toBe(
      'template'
    );
    expect(parseBlockManifest({ name: 'x', kind: 'leaf', trust: 'builtin' }, 'shipped')?.trust).toBe(
      'builtin'
    );
    expect(parseBlockManifest({ name: 'x', kind: 'leaf', trust: 'sandboxed' }, 'user')?.trust).toBe(
      'sandboxed'
    );
  });
});

describe('three-layer resolution', () => {
  const def = (name: string, source: BlockDefinition['source'], title = name): BlockDefinition => ({
    name,
    title,
    kind: 'leaf',
    trust: source === 'shipped' ? 'builtin' : 'template',
    source
  });

  it('first match wins: workspace shadows user shadows shipped', () => {
    const resolved = resolveBlocks(
      [def('date', 'workspace', 'WS Date')],
      [def('date', 'user', 'User Date'), def('note', 'user')],
      [def('date', 'shipped'), def('toc', 'shipped')]
    );
    const date = resolved.find((d) => d.name === 'date');
    expect(date?.source).toBe('workspace');
    expect(date?.title).toBe('WS Date');
    expect(resolved.map((d) => d.name).sort()).toEqual(['date', 'note', 'toc']);
  });

  it('is stable-sorted by title', () => {
    const resolved = resolveBlocks([], [], [def('b', 'shipped', 'Bravo'), def('a', 'shipped', 'Alpha')]);
    expect(resolved.map((d) => d.title)).toEqual(['Alpha', 'Bravo']);
  });
});

describe('discovered blocks insert as round-tripping shortcodes', () => {
  it('a leaf block inserts its shortcode', async () => {
    const { handle } = await mountEditor('start\n');
    setBlocks(SHIPPED_BLOCKS);
    const view = handle.getView();
    const cmd = blockInsertCommands(view.state.schema).find((c) => c.id === 'block-toc');
    expect(cmd).toBeTruthy();
    cmd!.run(view);
    const out = normalizeMarkdown(handle.getMarkdown());
    expect(out).toContain('<!-- omd:toc {} -->');
  });

  it('a block whose native form is plain GFM writes no machinery', async () => {
    // `date` lives on disk as the bare `📅 YYYY-MM-DD` token (docs/design/FORMATS.md), so its insert
    // asks for the date instead of writing a shortcode.
    const { handle } = await mountEditor('start\n');
    setBlocks(SHIPPED_BLOCKS);
    const view = handle.getView();
    blockInsertCommands(view.state.schema).find((c) => c.id === 'block-date')!.run(view);
    expect(normalizeMarkdown(handle.getMarkdown())).not.toContain('omd:date');
  });

  it('a container block inserts opener + body + closer', async () => {
    const { handle } = await mountEditor('start\n');
    setBlocks(SHIPPED_BLOCKS);
    const view = handle.getView();
    const cmd = blockInsertCommands(view.state.schema).find((c) => c.id === 'block-collapsible');
    cmd!.run(view);
    const out = normalizeMarkdown(handle.getMarkdown());
    expect(out).toContain('<!-- omd:collapsible {"summary":"Details"} -->');
    expect(out).toContain('<!-- /omd:collapsible -->');
  });

  it('exposes one insert command per discovered block', async () => {
    const { handle } = await mountEditor('x\n');
    setBlocks(SHIPPED_BLOCKS);
    const ids = blockInsertCommands(handle.getView().state.schema).map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['block-date', 'block-toc', 'block-collapsible']));
  });
});
