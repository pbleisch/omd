import { describe, it, expect } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { mountEditor } from './helpers/editor';
import { searchEmoji, emojiChar } from '../src/webview/ui/emoji-data';
import { normalizeMarkdown } from '../src/shared/roundtrip';

/**
 * Phase 6: `:name:` emoji shortcodes. The picker inserts the `:name:` shortcode (kept on disk, the
 * GitHub-source form); the editor renders it as the emoji glyph via a decoration, revealing the raw
 * shortcode when the cursor is on it. The renderer (preview/export) also converts shortcodes.
 */

describe('emoji search', () => {
  it('ranks exact and prefix matches ahead of substring matches', () => {
    const [first] = searchEmoji('smile');
    expect(first.name).toBe('smile');
  });

  it('matches keywords, not just names', () => {
    const names = searchEmoji('idea').map((e) => e.name);
    expect(names).toContain('bulb');
  });

  it('returns nothing for an unknown query', () => {
    expect(searchEmoji('zzznotanemoji')).toEqual([]);
  });
});

describe('emojiChar lookup', () => {
  it('maps known names to characters and rejects unknown', () => {
    expect(emojiChar('tada')).toBe('🎉');
    expect(emojiChar('ROCKET')).toBe('🚀'); // case-insensitive
    expect(emojiChar('definitely-not-an-emoji')).toBeNull();
  });
});

describe('emoji shortcode is kept on disk', () => {
  it('a :name: shortcode round-trips as text (not converted to the emoji char)', async () => {
    const md = 'Ship it :tada:\n';
    const { handle } = await mountEditor(md);
    expect(normalizeMarkdown(handle.getMarkdown())).toBe(normalizeMarkdown(md));
  });

  it('preserves underscores in emoji shortcodes byte-for-byte (serialize fixup)', async () => {
    // remark escapes `_` as `\_`; the fixup unescapes it inside known emoji shortcodes.
    const md = 'Done :white_check_mark: and :slightly_smiling_face:\n';
    const { handle } = await mountEditor(md);
    expect(handle.getMarkdown()).toBe(md);
  });
});

describe('emoji decoration', () => {
  it('renders a known :name: as its glyph, leaves an unknown one as text', async () => {
    const { root } = await mountEditor('Party :tada: but not :zzznope:.\n');
    const emoji = root.querySelector<HTMLElement>('.omd-emoji');
    expect(emoji?.getAttribute('data-emoji')).toBe('🎉');
    // only one decoration — the unknown shortcode isn't decorated
    expect(root.querySelectorAll('.omd-emoji')).toHaveLength(1);
  });

  it('does not decorate a shortcode inside inline code', async () => {
    const { root } = await mountEditor('Type `:tada:` to celebrate.\n');
    expect(root.querySelector('.omd-emoji')).toBeNull();
  });

  it('reveals the raw shortcode when the cursor is inside it', async () => {
    const { root, handle } = await mountEditor('Party :tada: here.\n');
    const view = handle.getView();
    expect(root.querySelector('.omd-emoji')).toBeTruthy();
    // Put the cursor inside ":tada:" — the decoration lifts so it can be edited.
    const at = view.state.doc.textContent.indexOf('tada') + 2; // +1 for doc start, +1 into "ta|da"
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
    expect(root.querySelector('.omd-emoji')).toBeNull();
  });
});
