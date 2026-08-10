import { describe, it, expect } from 'vitest';
import { applySerializeFixups } from '../src/webview/plugins/serialize-fixups';
import { roundTrip } from './helpers/editor';

/**
 * The serialize fixups unescape backslashes *remark added*. A backslash the writer typed
 * inside a code span or a code fence is content, and rewriting it changes what the document
 * says (#31). Each fixup — the alert marker, the wikilink, the emoji shortcode — gets both
 * halves: it still fires in prose, and it never fires inside code.
 */

describe('serialize fixups: prose', () => {
  it('unescapes an alert marker', () => {
    expect(applySerializeFixups('> \\[!NOTE]\n> Body.\n')).toBe('> [!NOTE]\n> Body.\n');
  });
  it('unescapes a wikilink', () => {
    expect(applySerializeFixups('See \\[\\[Roadmap]] today.\n')).toBe('See [[Roadmap]] today.\n');
    expect(applySerializeFixups('See \\[\\[the plan|Roadmap]].\n')).toBe(
      'See [[the plan|Roadmap]].\n'
    );
  });
  it('unescapes an emoji shortcode', () => {
    expect(applySerializeFixups('Done :white\\_check\\_mark: today.\n')).toBe(
      'Done :white_check_mark: today.\n'
    );
  });
});

describe('serialize fixups: inside inline code (#31)', () => {
  it('leaves an escaped alert marker in a code span alone', () => {
    const md = '- markers are unescaped (`\\[!NOTE]` → `[!NOTE]`) so alerts render\n';
    expect(applySerializeFixups(md)).toBe(md);
  });
  it('leaves an escaped wikilink in a code span alone', () => {
    const md = 'Write `\\[\\[Roadmap]]` to show the escaped spelling.\n';
    expect(applySerializeFixups(md)).toBe(md);
  });
  it('leaves an escaped emoji shortcode in a code span alone', () => {
    const md = 'Write `:white\\_check\\_mark:` to show the escaped spelling.\n';
    expect(applySerializeFixups(md)).toBe(md);
  });
  it('still fixes prose on the same line as a protected code span', () => {
    expect(applySerializeFixups('`\\[!NOTE]` and \\[\\[Roadmap]] and \\[!TIP]\n')).toBe(
      '`\\[!NOTE]` and [[Roadmap]] and [!TIP]\n'
    );
  });
  it('handles multi-backtick spans and an unmatched backtick run', () => {
    expect(applySerializeFixups('``a `\\[!NOTE]` b`` then \\[!TIP]\n')).toBe(
      '``a `\\[!NOTE]` b`` then [!TIP]\n'
    );
    // A lone backtick opens nothing, so the rest of the line is still prose.
    expect(applySerializeFixups('a ` b \\[!NOTE]\n')).toBe('a ` b [!NOTE]\n');
  });
  it('protects a code span that wraps across a line', () => {
    const md = 'text `\\[!NOTE]\nstill code` then \\[!TIP]\n';
    expect(applySerializeFixups(md)).toBe('text `\\[!NOTE]\nstill code` then [!TIP]\n');
  });
});

describe('serialize fixups: inside code fences (#31)', () => {
  it('leaves all three fixups alone inside a fenced block', () => {
    const md = '```md\n\\[!NOTE]\n\\[\\[Roadmap]]\n:white\\_check\\_mark:\n```\n';
    expect(applySerializeFixups(md)).toBe(md);
  });
  it('resumes fixing prose after the fence closes', () => {
    expect(applySerializeFixups('```\n\\[!NOTE]\n```\n\nthen \\[!TIP]\n')).toBe(
      '```\n\\[!NOTE]\n```\n\nthen [!TIP]\n'
    );
  });
  it('does not treat a fence info string as a closer', () => {
    const md = '~~~text\n\\[!NOTE]\n~~~\n';
    expect(applySerializeFixups(md)).toBe(md);
  });
});

describe('round-trip: the CONTRIBUTING.md:64 case (#31)', () => {
  it('keeps the backslash inside the code span', async () => {
    const md =
      '- GitHub alert markers are unescaped (`\\[!NOTE]` → `[!NOTE]`) so alerts render on GitHub\n  (`plugins/serialize-fixups.ts`).\n';
    expect(await roundTrip(md)).toBe(md);
  });
  it('still unescapes a real alert marker on the way out', async () => {
    expect(await roundTrip('> [!NOTE]\n> Body.\n')).toBe('> [!NOTE]\n> Body.\n');
  });
});
