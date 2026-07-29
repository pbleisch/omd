import { describe, it, expect } from 'vitest';
import { roundTrip, mountEditor } from './helpers/editor';
import { normalizeMarkdown } from '../src/shared/roundtrip';
import { parseParams } from '../src/shared/shortcode';
import {
  aiScope,
  aiContext,
  applyAiResult,
  requestPrompt,
  resolvePromptChunk,
  resolvePromptDone,
  resolvePromptError
} from '../src/webview/blocks/ai';
import { setModels, getModels, onModelsChanged } from '../src/webview/blocks/models-registry';

/**
 * The `ai` built-in (docs/design/FORMATS.md, `omd:ai`): the prompt/scope/model live in the shortcode
 * params, the generated markdown is cached in the body (the GitHub-visible, round-tripping result).
 * Nothing here runs a model — a run is host-mediated; these cover the on-disk contract and the pure
 * webview plumbing (context assembly, streaming resolution, applying a result to the body).
 */

const BLOCK =
  '<!-- omd:ai {"prompt":"Summarize the notes above","scope":"document","model":"gpt-4o"} -->\n\n' +
  '- First generated point.\n' +
  '- Second generated point.\n\n' +
  '<!-- /omd:ai -->\n';

/** Find the position of the single `ai` container in a live editor. */
function findAiPos(doc: import('prosemirror-model').Node): number {
  let pos = -1;
  doc.descendants((node, p) => {
    if (node.type.name === 'shortcode_container' && node.attrs.name === 'ai') pos = p;
    return true;
  });
  return pos;
}

describe('ai helpers', () => {
  it('aiScope normalizes the stored param', () => {
    expect(aiScope({ scope: 'document' })).toBe('document');
    expect(aiScope({ scope: 'none' })).toBe('none');
    expect(aiScope({})).toBe('none');
    expect(aiScope({ scope: 'bogus' })).toBe('none');
  });

  it('aiContext sends nothing for scope none', () => {
    expect(aiContext('none')).toBeUndefined();
  });

  it('aiContext returns the current document markdown for scope document', async () => {
    await mountEditor('# Heading\n\nBody paragraph.\n');
    const ctx = aiContext('document');
    expect(ctx).toContain('# Heading');
    expect(ctx).toContain('Body paragraph.');
  });
});

describe('ai round-trip', () => {
  it('preserves the shortcode, params, and cached body byte-for-byte', async () => {
    expect(normalizeMarkdown(await roundTrip(BLOCK))).toBe(normalizeMarkdown(BLOCK));
  });
});

describe('ai NodeView', () => {
  it('opens a filled block on its Result tab with the prompt in the editor', async () => {
    setModels([], true);
    const { root } = await mountEditor(BLOCK);
    const block = root.querySelector<HTMLElement>('.omd-block--ai');
    expect(block).toBeTruthy();
    expect(block!.dataset.mode).toBe('result');
    const input = root.querySelector<HTMLTextAreaElement>('.omd-ai-prompt-input');
    expect(input?.value).toBe('Summarize the notes above');
    // Result/Prompt tabs, not the generic block header.
    expect(root.querySelectorAll('.omd-block-tab')).toHaveLength(2);
  });

  it('opens an empty block on its Prompt tab', async () => {
    setModels([], true);
    const empty = '<!-- omd:ai {"prompt":"","scope":"none"} -->\n\n&nbsp;\n\n<!-- /omd:ai -->\n';
    const { root } = await mountEditor(empty);
    expect(root.querySelector<HTMLElement>('.omd-block--ai')?.dataset.mode).toBe('prompt');
  });
});

describe('ai model picker', () => {
  it('renders a dropdown of pushed models, valued by family, with the stored model selected', async () => {
    setModels(
      [
        { family: 'gpt-4o', name: 'GPT-4o', vendor: 'copilot' },
        { family: 'o1', name: 'o1', vendor: 'copilot' }
      ],
      true
    );
    const { root } = await mountEditor(BLOCK);
    const select = root.querySelector<HTMLSelectElement>('.omd-ai-model-host select');
    expect(select).toBeTruthy();
    const values = [...select!.options].map((o) => o.value);
    expect(values).toContain('gpt-4o');
    expect(values).toContain('o1');
    expect(values).toContain(''); // the "Default (setting)" option
    expect(select!.value).toBe('gpt-4o');
  });

  it('falls back to a free-text field when no models are available', async () => {
    setModels([], true);
    const { root } = await mountEditor(BLOCK);
    expect(root.querySelector('.omd-ai-model-host select')).toBeNull();
    const input = root.querySelector<HTMLInputElement>('.omd-ai-model-host input');
    expect(input?.value).toBe('gpt-4o'); // the stored family, still editable
  });

  it('keeps a stored-but-unavailable family selectable', async () => {
    setModels([{ family: 'o1', name: 'o1', vendor: 'copilot' }], true); // BLOCK stores gpt-4o, not listed
    const { root } = await mountEditor(BLOCK);
    const select = root.querySelector<HTMLSelectElement>('.omd-ai-model-host select');
    expect([...select!.options].map((o) => o.value)).toContain('gpt-4o');
    expect(select!.value).toBe('gpt-4o');
  });
});

describe('models registry', () => {
  it('stores the list and notifies subscribers, until unsubscribed', () => {
    setModels([], true);
    let calls = 0;
    const off = onModelsChanged(() => calls++);
    setModels([{ family: 'x', name: 'X', vendor: 'v' }], true);
    expect(getModels()).toHaveLength(1);
    expect(calls).toBe(1);
    off();
    setModels([], true);
    expect(calls).toBe(1); // no longer notified
  });
});

describe('applyAiResult', () => {
  it('replaces the body with the parsed markdown result and keeps the params', async () => {
    const { handle } = await mountEditor(BLOCK);
    const view = handle.getView();
    const pos = findAiPos(view.state.doc);
    expect(pos).toBeGreaterThanOrEqual(0);

    applyAiResult(view, pos, '## Result\n\nA fresh answer.\n');

    const out = handle.getMarkdown();
    expect(out).toContain('## Result');
    expect(out).toContain('A fresh answer.');
    // The old cached body is gone; the prompt param is untouched.
    expect(out).not.toContain('First generated point');
    const params = parseParams(
      view.state.doc.nodeAt(findAiPos(view.state.doc))!.attrs.params as string
    );
    expect(params).toMatchObject({ prompt: 'Summarize the notes above', model: 'gpt-4o' });
  });

  it('falls back to a paragraph when the result is empty, keeping the container valid', async () => {
    const { handle } = await mountEditor(BLOCK);
    const view = handle.getView();
    applyAiResult(view, findAiPos(view.state.doc), '');
    // Still a well-formed ai container that round-trips (no crash, no orphaned tags).
    const out = handle.getMarkdown();
    expect(out).toContain('<!-- omd:ai');
    expect(out).toContain('<!-- /omd:ai -->');
  });
});

describe('ai streaming plumbing', () => {
  it('accumulates chunks and resolves on done', async () => {
    const chunks: string[] = [];
    const { nonce, done } = requestPrompt({ prompt: 'hi' }, (t) => chunks.push(t));
    resolvePromptChunk(nonce, 'Hello, ');
    resolvePromptChunk(nonce, 'world.');
    resolvePromptDone(nonce);
    await expect(done).resolves.toBe('Hello, world.');
    expect(chunks).toEqual(['Hello, ', 'world.']);
  });

  it('rejects with the typed failure on error', async () => {
    const { nonce, done } = requestPrompt({ prompt: 'hi' }, () => {});
    resolvePromptError(nonce, { code: 'disabled', message: 'AI is off.' });
    await expect(done).rejects.toMatchObject({ code: 'disabled', message: 'AI is off.' });
  });
});
