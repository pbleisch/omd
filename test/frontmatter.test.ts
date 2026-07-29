import { describe, it, expect } from 'vitest';
import { mountEditor, roundTrip } from './helpers/editor';
import { normalizeMarkdown } from '../src/shared/roundtrip';

/**
 * Phase 6: YAML front matter is a real node now, so it survives an edit instead of being
 * mangled into a thematic break + prose. Preservation is the correctness fix; the panel
 * edits scalar keys on top.
 */

describe('front matter preservation', () => {
  it('round-trips a front matter block byte-for-byte', async () => {
    const md = '---\ntitle: Hello\ncount: 3\n---\n\nBody.\n';
    expect(await roundTrip(md)).toBe(md);
  });

  it('keeps list/nested values intact through the editor', async () => {
    const md = '---\ntags:\n  - a\n  - b\n---\n\nBody.\n';
    expect(await roundTrip(md)).toBe(md);
  });

  it('renders as an inline inspector, not a heading/hr', async () => {
    const { root } = await mountEditor('---\ntitle: Hi\n---\n\nBody.\n');
    expect(root.querySelector('.omd-frontmatter')).toBeTruthy();
    // Fields mode by default: an input seeded from the scalar value, plus a Fields/Source toggle.
    const input = root.querySelector<HTMLInputElement>('.omd-frontmatter-form input');
    expect(input?.value).toBe('Hi');
    const tabs = [...root.querySelectorAll('.omd-frontmatter .omd-block-tab')].map((t) => t.textContent);
    expect(tabs).toEqual(['Fields', 'Source']);
  });
});

describe('front matter editing', () => {
  it('writes an edited field back as valid YAML and round-trips', async () => {
    const { root, handle } = await mountEditor('---\ntitle: Old\ndraft: true\n---\n\nBody.\n');
    const input = root.querySelector<HTMLInputElement>('.omd-frontmatter-form input[type="text"]')!;
    expect(input.value).toBe('Old');
    input.value = 'New';
    input.dispatchEvent(new Event('change', { bubbles: true }));

    const out = normalizeMarkdown(handle.getMarkdown());
    expect(out).toContain('title: New');
    expect(out).toContain('draft: true'); // untouched key preserved
    expect(out).not.toContain('title: Old');
  });

  it('renders a scalar list as editable tag pills with an Add affordance', async () => {
    const { root } = await mountEditor('---\ntags:\n  - alpha\n  - beta\n---\n\nBody.\n');
    const pills = [...root.querySelectorAll('.omd-pill-item span:first-child')].map((s) => s.textContent);
    expect(pills).toEqual(['alpha', 'beta']);
    expect(root.querySelector<HTMLInputElement>('.omd-field-listinput')?.placeholder).toBe('Add…');
  });

  it('adding a tag writes it into the YAML list', async () => {
    const { root, handle } = await mountEditor('---\ntags:\n  - alpha\n---\n\nBody.\n');
    const listInput = root.querySelector<HTMLInputElement>('.omd-field-listinput')!;
    listInput.value = 'gamma';
    listInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const out = normalizeMarkdown(handle.getMarkdown());
    expect(out).toContain('- alpha');
    expect(out).toContain('- gamma');
  });

  it('removing a tag pill drops it from the YAML list', async () => {
    const { root, handle } = await mountEditor('---\ntags:\n  - alpha\n  - beta\n---\n\nBody.\n');
    const firstRemove = root.querySelector<HTMLButtonElement>('.omd-pill-item .omd-pill-remove')!;
    firstRemove.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const out = normalizeMarkdown(handle.getMarkdown());
    expect(out).not.toContain('alpha');
    expect(out).toContain('- beta');
  });

  it('flags invalid YAML inline with an error banner', async () => {
    const { root } = await mountEditor('---\nbad: [unclosed\n---\n\n# Body\n');
    expect(root.querySelector('.omd-frontmatter--error')).toBeTruthy();
    expect(root.querySelector('.omd-frontmatter-error')?.textContent).toContain(
      'Front matter is not valid YAML'
    );
  });

  it('shows no error for valid YAML', async () => {
    const { root } = await mountEditor('---\ntitle: Fine\n---\n\n# Body\n');
    expect(root.querySelector('.omd-frontmatter--error')).toBeNull();
  });
});
