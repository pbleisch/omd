/**
 * Serialization fix-ups applied to Milkdown's markdown output before it leaves the
 * editor. These correct places where remark-stringify is technically valid CommonMark
 * but breaks GitHub rendering or the round-trip.
 */

import { emojiChar } from '../ui/emoji-data';

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

export function applySerializeFixups(markdown: string): string {
  return unescapeEmojiShortcodes(
    markdown.replace(ESCAPED_ALERT, '[!$1]').replace(ESCAPED_WIKILINK, '[[$1]]')
  );
}
