import { describe, it, expect, beforeEach } from 'vitest';
import { mountEditor } from './helpers/editor';
import { setBlocks } from '../src/webview/blocks/registry';
import { blockInsertCommands } from '../src/webview/blocks/insert';
import { closeParamPanel } from '../src/webview/ui/param-panel';
import { parseBlockManifest, SHIPPED_BLOCKS, type BlockDefinition } from '../src/shared/blocks';
import { normalizeMarkdown } from '../src/shared/roundtrip';

const embed: BlockDefinition = parseBlockManifest(
  { name: 'embed', kind: 'container', title: 'Embed', params: [{ name: 'src', type: 'string', required: true }] },
  'workspace'
)!;

describe('required params on insert', () => {
  beforeEach(() => { setBlocks([embed, ...SHIPPED_BLOCKS]); closeParamPanel(); document.body.innerHTML=''; });

  it('parses the required flag', () => {
    expect(embed.params?.[0].required).toBe(true);
  });

  it('prompts before inserting and gates Insert until required is filled', async () => {
    const { handle } = await mountEditor('start\n');
    const view = handle.getView();
    const cmd = blockInsertCommands(view.state.schema).find((c) => c.id === 'block-embed')!;
    cmd.run(view);

    // A panel opens with an Insert button, disabled until required is filled; nothing inserted yet.
    const panel = document.querySelector('.omd-param-panel')!;
    const applyBtn = panel.querySelector<HTMLButtonElement>('.omd-param-panel-apply')!;
    expect(applyBtn.textContent).toBe('Insert');
    expect(applyBtn.disabled).toBe(true);
    expect(normalizeMarkdown(handle.getMarkdown())).toBe('start\n');

    const input = panel.querySelector<HTMLInputElement>('input[type="text"]')!;
    input.value = 'https://x.dev';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(applyBtn.disabled).toBe(false);

    applyBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const out = normalizeMarkdown(handle.getMarkdown());
    expect(out).toContain('<!-- omd:embed {"src":"https://x.dev"} -->');
  });

  it('inserts immediately when no params are required', async () => {
    const { handle } = await mountEditor('start\n');
    const view = handle.getView();
    // toc has only optional params → inserts without a prompt.
    const cmd = blockInsertCommands(view.state.schema).find((c) => c.id === 'block-toc')!;
    cmd.run(view);
    expect(document.querySelector('.omd-param-panel')).toBeNull();
    expect(normalizeMarkdown(handle.getMarkdown())).toContain('<!-- omd:toc');
  });
});
