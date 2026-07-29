import { describe, it, expect } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { mountEditor, roundTrip } from './helpers/editor';
import { buildCommands } from '../src/webview/commands/registry';
import { normalizeMarkdown } from '../src/shared/roundtrip';

describe('inline html marks roundtrip', () => {
  it('preserves underline, subscript, superscript', async () => {
    expect(await roundTrip('This is <u>underlined</u>.\n')).toBe('This is <u>underlined</u>.\n');
    expect(await roundTrip('H<sub>2</sub>O\n')).toBe('H<sub>2</sub>O\n');
    expect(await roundTrip('E = mc<sup>2</sup>\n')).toBe('E = mc<sup>2</sup>\n');
  });

  it('round-trips the semantic inline tags (kbd/mark/samp/var/cite/small)', async () => {
    expect(await roundTrip('Press <kbd>Cmd</kbd> then <kbd>S</kbd>.\n')).toBe('Press <kbd>Cmd</kbd> then <kbd>S</kbd>.\n');
    expect(await roundTrip('A <mark>highlighted</mark> word.\n')).toBe('A <mark>highlighted</mark> word.\n');
    expect(await roundTrip('Output: <samp>done</samp>.\n')).toBe('Output: <samp>done</samp>.\n');
    expect(await roundTrip('Let <var>x</var> be a number.\n')).toBe('Let <var>x</var> be a number.\n');
    expect(await roundTrip('See <cite>The Book</cite>.\n')).toBe('See <cite>The Book</cite>.\n');
    expect(await roundTrip('A <small>footnote-ish</small> aside.\n')).toBe('A <small>footnote-ish</small> aside.\n');
  });
});

describe('inline mark commands', () => {
  it('underline command wraps a selection in <u>', async () => {
    const { handle } = await mountEditor('hello world\n');
    const view = handle.getView();
    const cmds = new Map(buildCommands(view.state.schema).map((c) => [c.id, c]));
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6)));
    cmds.get('underline')!.run(view);
    expect(normalizeMarkdown(handle.getMarkdown())).toBe('<u>hello</u> world\n');
  });
});
