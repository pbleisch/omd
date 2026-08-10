/**
 * Serialization fix-ups applied to Milkdown's markdown output before it leaves the
 * editor. These correct places where remark-stringify is technically valid CommonMark
 * but breaks GitHub rendering or the round-trip.
 */

import { emojiChar } from '../ui/emoji-data';
import { codeSpanRanges, FENCE_CLOSE, FENCE_LINE } from './md-scan';
import { relaxEscapes } from './relax-escapes';

const ALERT_KINDS = 'NOTE|TIP|IMPORTANT|WARNING|CAUTION';
// remark escapes the `[` in a blockquote as `\[`, which stops GitHub from recognizing
// the alert. The marker `[!NOTE]` etc. is unambiguous, so unescape just that.
const ESCAPED_ALERT = new RegExp(`\\\\\\[!(${ALERT_KINDS})\\]`, 'g');

// remark escapes a wikilink's opening brackets as `\[\[`, which would change the bytes on
// disk and stop OMD recognizing the reference on reload. Requiring the closing `]]` keeps
// this from touching genuinely escaped brackets that aren't wikilinks.
const ESCAPED_WIKILINK = /\\\[\\\[([^\][|]+(?:\|[^\]]+)?)\]\]/g;

// remark escapes the `_` in an emoji shortcode (`:white_check_mark:` → `:white\_check\_mark:`),
// which changes the bytes on disk — many GitHub emoji have underscores. Unescape within a known
// shortcode only (checked against the emoji set), so genuinely-escaped `:foo\_bar:` text is left.
const EMOJI_SHORTCODE = /:((?:[a-z0-9+-]|\\_)+):/gi;
function unescapeEmojiShortcodes(markdown: string): string {
  return markdown.replace(EMOJI_SHORTCODE, (whole, inner: string) => {
    const name = inner.replace(/\\_/g, '_');
    return emojiChar(name) ? `:${name}:` : whole;
  });
}

/**
 * Apply `transform` to the prose of `markdown`, never to code. A fixup unescapes a
 * backslash the serializer added; inside a code span or a code fence the backslash is
 * content the writer typed, and rewriting it silently changes what the document says
 * (#31 — `CONTRIBUTING.md:64`, a sentence about the escaped vs unescaped spelling that
 * came back showing the same spelling twice).
 *
 * Fences are matched line-wise; inline code spans are matched over the whole run of
 * non-fence lines, so a span that wraps across a line is still protected. Indented code
 * blocks are not handled: `fences: true` in the serializer options means the output
 * never contains one.
 */
function replaceOutsideCode(markdown: string, transform: (prose: string) => string): string {
  const out: string[] = [];
  let prose: string[] = [];
  let fence: string | null = null;

  const flush = () => {
    if (prose.length === 0) return;
    out.push(replaceOutsideCodeSpans(prose.join('\n'), transform));
    prose = [];
  };

  for (const line of markdown.split('\n')) {
    if (fence) {
      const close = FENCE_CLOSE.exec(line);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
      out.push(line);
      continue;
    }
    const open = FENCE_LINE.exec(line);
    if (open) {
      flush();
      fence = open[1];
      out.push(line);
      continue;
    }
    prose.push(line);
  }
  flush();
  return out.join('\n');
}

/** Apply `transform` to everything outside an inline code span (`codeSpanRanges`). */
function replaceOutsideCodeSpans(text: string, transform: (prose: string) => string): string {
  let out = '';
  let proseStart = 0;
  for (const [openStart, closeEnd] of codeSpanRanges(text)) {
    out += transform(text.slice(proseStart, openStart)) + text.slice(openStart, closeEnd);
    proseStart = closeEnd;
  }
  return out + transform(text.slice(proseStart));
}

export function applySerializeFixups(markdown: string): string {
  const fixed = replaceOutsideCode(markdown, (prose) =>
    unescapeEmojiShortcodes(
      prose.replace(ESCAPED_ALERT, '[!$1]').replace(ESCAPED_WIKILINK, '[[$1]]')
    )
  );
  // Last, so it judges the bytes that are actually about to be written.
  return relaxEscapes(fixed);
}
