/**
 * A curated emoji set for the `:name:` autocomplete (Phase 6). Deliberately a hand-picked
 * list of common shortcodes rather than the full Unicode set — enough to be useful without
 * bundling a large table. Emoji is *content* (it lands in the markdown as the character), so
 * this is fine to grow; UI chrome stays codicons (docs/design/STYLE.md).
 */
export interface Emoji {
  name: string;
  char: string;
  /** Extra search terms. */
  keywords?: string[];
}

export const EMOJI: Emoji[] = [
  { name: 'smile', char: '😄', keywords: ['happy', 'joy'] },
  { name: 'grinning', char: '😀', keywords: ['happy'] },
  { name: 'laughing', char: '😆', keywords: ['haha', 'lol'] },
  { name: 'joy', char: '😂', keywords: ['tears', 'laugh'] },
  { name: 'rofl', char: '🤣', keywords: ['rolling', 'laugh'] },
  { name: 'wink', char: '😉' },
  { name: 'blush', char: '😊', keywords: ['smile'] },
  { name: 'slightly_smiling_face', char: '🙂' },
  { name: 'upside_down_face', char: '🙃' },
  { name: 'yum', char: '😋', keywords: ['tasty'] },
  { name: 'sunglasses', char: '😎', keywords: ['cool'] },
  { name: 'heart_eyes', char: '😍', keywords: ['love'] },
  { name: 'kissing_heart', char: '😘', keywords: ['kiss'] },
  { name: 'thinking', char: '🤔', keywords: ['hmm'] },
  { name: 'neutral_face', char: '😐' },
  { name: 'expressionless', char: '😑' },
  { name: 'no_mouth', char: '😶' },
  { name: 'smirk', char: '😏' },
  { name: 'unamused', char: '😒' },
  { name: 'roll_eyes', char: '🙄' },
  { name: 'grimacing', char: '😬' },
  { name: 'relieved', char: '😌' },
  { name: 'pensive', char: '😔' },
  { name: 'sleepy', char: '😪' },
  { name: 'sleeping', char: '😴' },
  { name: 'mask', char: '😷', keywords: ['sick'] },
  { name: 'nauseated_face', char: '🤢', keywords: ['sick'] },
  { name: 'sneezing_face', char: '🤧' },
  { name: 'dizzy_face', char: '😵' },
  { name: 'cold_sweat', char: '😰' },
  { name: 'cry', char: '😢', keywords: ['sad', 'tear'] },
  { name: 'sob', char: '😭', keywords: ['cry', 'sad'] },
  { name: 'scream', char: '😱', keywords: ['fear'] },
  { name: 'confused', char: '😕' },
  { name: 'worried', char: '😟' },
  { name: 'frowning', char: '😦' },
  { name: 'anguished', char: '😧' },
  { name: 'angry', char: '😠', keywords: ['mad'] },
  { name: 'rage', char: '😡', keywords: ['angry', 'mad'] },
  { name: 'triumph', char: '😤' },
  { name: 'exploding_head', char: '🤯', keywords: ['mind', 'blown'] },
  { name: 'flushed', char: '😳' },
  { name: 'star_struck', char: '🤩', keywords: ['stars'] },
  { name: 'partying_face', char: '🥳', keywords: ['party', 'celebrate'] },
  { name: 'shushing_face', char: '🤫', keywords: ['quiet'] },
  { name: 'zipper_mouth', char: '🤐' },
  { name: 'thumbsup', char: '👍', keywords: ['+1', 'yes', 'like'] },
  { name: 'thumbsdown', char: '👎', keywords: ['-1', 'no', 'dislike'] },
  { name: 'ok_hand', char: '👌' },
  { name: 'clap', char: '👏', keywords: ['applause'] },
  { name: 'raised_hands', char: '🙌', keywords: ['praise'] },
  { name: 'pray', char: '🙏', keywords: ['thanks', 'please'] },
  { name: 'wave', char: '👋', keywords: ['hello', 'bye'] },
  { name: 'point_up', char: '☝️' },
  { name: 'point_right', char: '👉' },
  { name: 'point_left', char: '👈' },
  { name: 'muscle', char: '💪', keywords: ['strong', 'flex'] },
  { name: 'fist', char: '✊' },
  { name: 'v', char: '✌️', keywords: ['peace', 'victory'] },
  { name: 'crossed_fingers', char: '🤞', keywords: ['luck'] },
  { name: 'handshake', char: '🤝', keywords: ['deal'] },
  { name: 'writing_hand', char: '✍️' },
  { name: 'eyes', char: '👀', keywords: ['look', 'watch'] },
  { name: 'brain', char: '🧠' },
  { name: 'heart', char: '❤️', keywords: ['love'] },
  { name: 'orange_heart', char: '🧡' },
  { name: 'yellow_heart', char: '💛' },
  { name: 'green_heart', char: '💚' },
  { name: 'blue_heart', char: '💙' },
  { name: 'purple_heart', char: '💜' },
  { name: 'black_heart', char: '🖤' },
  { name: 'broken_heart', char: '💔' },
  { name: 'sparkling_heart', char: '💖' },
  { name: 'fire', char: '🔥', keywords: ['lit', 'hot'] },
  { name: 'sparkles', char: '✨', keywords: ['shiny', 'stars'] },
  { name: 'star', char: '⭐', keywords: ['favorite'] },
  { name: 'star2', char: '🌟', keywords: ['glowing'] },
  { name: 'boom', char: '💥', keywords: ['explosion'] },
  { name: 'zap', char: '⚡', keywords: ['lightning', 'fast'] },
  { name: 'tada', char: '🎉', keywords: ['party', 'celebrate'] },
  { name: 'confetti_ball', char: '🎊' },
  { name: 'balloon', char: '🎈' },
  { name: 'gift', char: '🎁', keywords: ['present'] },
  { name: 'trophy', char: '🏆', keywords: ['win', 'award'] },
  { name: 'medal', char: '🏅' },
  { name: 'checkered_flag', char: '🏁', keywords: ['finish', 'race'] },
  { name: 'rocket', char: '🚀', keywords: ['launch', 'ship', 'fast'] },
  { name: 'bulb', char: '💡', keywords: ['idea', 'light'] },
  { name: 'wrench', char: '🔧', keywords: ['fix', 'tool'] },
  { name: 'hammer', char: '🔨', keywords: ['build', 'tool'] },
  { name: 'gear', char: '⚙️', keywords: ['settings'] },
  { name: 'lock', char: '🔒', keywords: ['secure'] },
  { name: 'key', char: '🔑' },
  { name: 'mag', char: '🔍', keywords: ['search', 'find'] },
  { name: 'link', char: '🔗' },
  { name: 'paperclip', char: '📎', keywords: ['attach'] },
  { name: 'pushpin', char: '📌', keywords: ['pin'] },
  { name: 'calendar', char: '📅', keywords: ['date'] },
  { name: 'memo', char: '📝', keywords: ['note', 'write'] },
  { name: 'book', char: '📖', keywords: ['read'] },
  { name: 'books', char: '📚' },
  { name: 'bookmark', char: '🔖' },
  { name: 'clipboard', char: '📋' },
  { name: 'chart_with_upwards_trend', char: '📈', keywords: ['graph', 'growth'] },
  { name: 'chart_with_downwards_trend', char: '📉' },
  { name: 'bar_chart', char: '📊', keywords: ['graph', 'stats'] },
  { name: 'email', char: '📧', keywords: ['mail'] },
  { name: 'bell', char: '🔔', keywords: ['notify'] },
  { name: 'warning', char: '⚠️', keywords: ['caution'] },
  { name: 'no_entry', char: '⛔', keywords: ['stop', 'forbidden'] },
  { name: 'white_check_mark', char: '✅', keywords: ['done', 'check', 'yes'] },
  { name: 'heavy_check_mark', char: '✔️', keywords: ['check', 'done'] },
  { name: 'x', char: '❌', keywords: ['no', 'cross', 'wrong'] },
  { name: 'question', char: '❓' },
  { name: 'exclamation', char: '❗' },
  { name: 'bangbang', char: '‼️' },
  { name: 'heavy_plus_sign', char: '➕', keywords: ['add'] },
  { name: 'heavy_minus_sign', char: '➖' },
  { name: 'recycle', char: '♻️' },
  { name: 'arrow_right', char: '➡️' },
  { name: 'arrow_left', char: '⬅️' },
  { name: 'arrow_up', char: '⬆️' },
  { name: 'arrow_down', char: '⬇️' },
  { name: 'hourglass', char: '⌛', keywords: ['time', 'wait'] },
  { name: 'alarm_clock', char: '⏰', keywords: ['time'] },
  { name: 'coffee', char: '☕', keywords: ['cafe'] },
  { name: 'pizza', char: '🍕' },
  { name: 'beer', char: '🍺' },
  { name: 'hamburger', char: '🍔' },
  { name: 'cake', char: '🍰' },
  { name: 'apple', char: '🍎' },
  { name: 'sun', char: '☀️', keywords: ['sunny', 'weather'] },
  { name: 'cloud', char: '☁️', keywords: ['weather'] },
  { name: 'rainbow', char: '🌈' },
  { name: 'snowflake', char: '❄️', keywords: ['cold', 'winter'] },
  { name: 'earth_americas', char: '🌎', keywords: ['world', 'globe'] },
  { name: 'moon', char: '🌙' },
  { name: 'dog', char: '🐶' },
  { name: 'cat', char: '🐱' },
  { name: 'unicorn', char: '🦄' },
  { name: 'bug', char: '🐛', keywords: ['insect', 'issue'] },
  { name: 'snake', char: '🐍' },
  { name: 'robot', char: '🤖', keywords: ['bot', 'ai'] },
  { name: 'ghost', char: '👻' },
  { name: 'alien', char: '👽' },
  { name: 'skull', char: '💀', keywords: ['dead'] },
  { name: 'poop', char: '💩', keywords: ['poo', 'crap'] },
  { name: 'wave_hand', char: '👋' },
  { name: '100', char: '💯', keywords: ['hundred', 'perfect'] }
];

/**
 * Emoji whose name or a keyword matches `query`, capped at `limit`. A name match always
 * outranks a keyword match (so `:smile:` finds `smile`, not `blush` whose keyword is
 * "smile"), and exact beats prefix beats substring.
 */
export function searchEmoji(query: string, limit = 8): Emoji[] {
  const q = query.toLowerCase();
  if (!q) return EMOJI.slice(0, limit);
  const scored: Array<{ e: Emoji; score: number }> = [];
  for (const e of EMOJI) {
    let score = 0;
    if (e.name === q) score = 100;
    else if (e.name.startsWith(q)) score = 60;
    else if (e.name.includes(q)) score = 40;
    if (score === 0) {
      for (const term of e.keywords ?? []) {
        if (term === q) score = Math.max(score, 20);
        else if (term.startsWith(q)) score = Math.max(score, 12);
        else if (term.includes(q)) score = Math.max(score, 6);
      }
    }
    if (score > 0) scored.push({ e, score });
  }
  scored.sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name));
  return scored.slice(0, limit).map((s) => s.e);
}

const BY_NAME = new Map(EMOJI.map((e) => [e.name, e.char]));

/** The emoji character for an exact `:name:` (no colons), or null. Used by the type-to-convert rule. */
export function emojiChar(name: string): string | null {
  return BY_NAME.get(name.toLowerCase()) ?? null;
}
