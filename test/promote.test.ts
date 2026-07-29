import { describe, it, expect } from 'vitest';
import { mountEditor, roundTrip } from './helpers/editor';
import {
  promoteCalloutToManaged,
  demoteManagedToNative,
  updateManagedCallout
} from '../src/webview/blocks/promote';
import { normalizeMarkdown } from '../src/shared/roundtrip';

/**
 * P4 native ↔ managed promotion (docs/design/SMART-BLOCKS.md). Promotion is a user edit, not a
 * round-trip: it swaps a native `> [!NOTE]` for a managed `omd:note` block carrying the
 * params the bare alert can't hold. Both forms must round-trip, the body's marks must
 * survive the trip, and clearing the customization must remove the machinery again.
 */

function docTypes(view: import('prosemirror-view').EditorView): string[] {
  const types: string[] = [];
  view.state.doc.descendants((n) => {
    types.push(n.type.name);
    return true;
  });
  return types;
}

describe('promotion', () => {
  it('promotes a native callout to a managed block, preserving body marks', async () => {
    const { handle } = await mountEditor('> [!NOTE]\n> Body with **bold**.\n');
    const view = handle.getView();
    expect(promoteCalloutToManaged(view, 0, 'note', { title: 'Heads up' })).toBe(true);

    expect(docTypes(view)[0]).toBe('shortcode_container');
    const out = normalizeMarkdown(handle.getMarkdown());
    expect(out).toBe(
      normalizeMarkdown(
        '<!-- omd:note {"title":"Heads up"} -->\n\nBody with **bold**.\n\n<!-- /omd:note -->\n'
      )
    );
  });

  it('the promoted managed form round-trips byte-for-byte', async () => {
    const managed =
      '<!-- omd:note {"title":"Heads up"} -->\n\nBody with **bold**.\n\n<!-- /omd:note -->\n';
    expect(normalizeMarkdown(await roundTrip(managed))).toBe(normalizeMarkdown(managed));
  });

  it('does not promote a plain (non-callout) blockquote', async () => {
    const { handle } = await mountEditor('> just a quote\n');
    expect(promoteCalloutToManaged(handle.getView(), 0, 'note', { title: 'x' })).toBe(false);
  });
});

describe('demotion', () => {
  it('demotes a managed callout back to a native alert on its own marker line', async () => {
    const { handle } = await mountEditor(
      '<!-- omd:note {"title":"Heads up"} -->\n\nBody with **bold**.\n\n<!-- /omd:note -->\n'
    );
    const view = handle.getView();
    expect(demoteManagedToNative(view, 0)).toBe(true);
    expect(docTypes(view)[0]).toBe('blockquote');
    const out = normalizeMarkdown(handle.getMarkdown());
    expect(out).toBe(normalizeMarkdown('> [!NOTE]\n>\n> Body with **bold**.\n'));
  });

  it('clearing the title demotes (never leaves empty machinery behind)', async () => {
    const { handle } = await mountEditor(
      '<!-- omd:note {"title":"Heads up"} -->\n\nBody.\n\n<!-- /omd:note -->\n'
    );
    const view = handle.getView();
    updateManagedCallout(view, 0, { title: '' });
    expect(docTypes(view)[0]).toBe('blockquote');
    expect(normalizeMarkdown(handle.getMarkdown())).toContain('[!NOTE]');
  });

  it('setting a new title updates params in place without demoting', async () => {
    const { handle } = await mountEditor(
      '<!-- omd:note {"title":"Old"} -->\n\nBody.\n\n<!-- /omd:note -->\n'
    );
    const view = handle.getView();
    updateManagedCallout(view, 0, { title: 'New' });
    expect(docTypes(view)[0]).toBe('shortcode_container');
    expect(normalizeMarkdown(handle.getMarkdown())).toContain('{"title":"New"}');
  });
});

describe('round-trip through a promote/demote cycle', () => {
  it('native → managed → native returns valid GFM', async () => {
    const { handle } = await mountEditor('> [!TIP]\n> Use **marks**.\n');
    const view = handle.getView();
    promoteCalloutToManaged(view, 0, 'tip', { title: 'Pro tip' });
    demoteManagedToNative(view, 0);
    const out = normalizeMarkdown(handle.getMarkdown());
    expect(out).toContain('[!TIP]');
    expect(out).toContain('**marks**');
  });
});
