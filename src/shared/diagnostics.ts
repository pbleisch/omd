import { parse as parseYaml } from 'yaml';

/**
 * Document validation. Everything here is a *pure* function of the markdown
 * text, so the rules are testable in isolation; the host maps the character offsets to editor
 * ranges and surfaces them in the Problems panel, and adds the one check that needs the
 * filesystem (a relative link to a file that doesn't exist).
 *
 * The checks are deliberately conservative — a false positive in the Problems panel is worse
 * than a missed one, because it trains the writer to ignore the panel.
 */

export type Severity = 'error' | 'warning';

export interface QuickFix {
  title: string;
  from: number;
  to: number;
  text: string;
}

export interface Diagnostic {
  from: number;
  to: number;
  message: string;
  severity: Severity;
  code: string;
  fix?: QuickFix;
}

/** GitHub-style heading slug: lowercased, punctuation dropped, spaces to hyphens. */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');
}

/** Every heading's text and de-duplicated slug, in order, skipping fenced code. */
export function headingSlugs(text: string): Array<{ text: string; slug: string }> {
  const seen = new Map<string, number>();
  const out: Array<{ text: string; slug: string }> = [];
  let inFence = false;
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const base = slugify(m[1]);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.push({ text: m[1], slug: n === 0 ? base : `${base}-${n}` });
  }
  return out;
}

/** Levenshtein distance, for suggesting the nearest heading to a broken anchor. */
function distance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Positions of fenced code regions, so other checks can ignore what's inside them. */
function fenceRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const re = /^(```|~~~).*$/gm;
  let open: number | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (open === null) open = m.index;
    else {
      ranges.push([open, m.index + m[0].length]);
      open = null;
    }
  }
  if (open !== null) ranges.push([open, text.length]);
  return ranges;
}

function inRanges(pos: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([a, b]) => pos >= a && pos < b);
}

// A backtick run, then content, then a matching run of the same length — CommonMark inline code.
const INLINE_CODE_RE = /(`+)(?:[^`]|(?!\1)`)+?\1/g;

/** Ranges of inline code spans (`` `like this` ``) — their contents are literal, not markup. */
function inlineCodeRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  INLINE_CODE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_CODE_RE.exec(text))) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

/**
 * Ranges to skip when scanning for links: fenced blocks and inline code. A `[x](y)` written inside
 * either is an *example*, not a real link — skipping them keeps examples like `` `![](…)` `` from
 * being flagged as broken (which is exactly what the Problems panel was doing to prose).
 */
function codeRanges(text: string): Array<[number, number]> {
  return [...fenceRanges(text), ...inlineCodeRanges(text)];
}

function checkFrontMatter(text: string, out: Diagnostic[]): void {
  const m = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text);
  if (!m) return;
  try {
    parseYaml(m[1]);
  } catch (err) {
    out.push({
      from: 0,
      to: m[0].length,
      message: `Front matter is not valid YAML: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`,
      severity: 'error',
      code: 'frontmatter'
    });
  }
}

const LINK_RE = /\[([^\]]*)\]\(([^)]*)\)/g;

function checkLinks(text: string, out: Diagnostic[]): void {
  const skip = codeRanges(text);
  const slugs = new Set(headingSlugs(text).map((h) => h.slug));
  let m: RegExpExecArray | null;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(text))) {
    if (inRanges(m.index, skip)) continue;
    const target = m[2].trim();
    const targetStart = m.index + m[0].indexOf('(') + 1;

    if (target === '') {
      out.push({
        from: m.index,
        to: m.index + m[0].length,
        message: 'Link has no target.',
        severity: 'warning',
        code: 'empty-link'
      });
      continue;
    }

    if (target.startsWith('#')) {
      const anchor = decodeURIComponent(target.slice(1)).toLowerCase();
      if (slugs.has(anchor)) continue;
      const nearest = [...slugs]
        .map((s) => ({ s, d: distance(anchor, s) }))
        .sort((a, b) => a.d - b.d)[0];
      const diag: Diagnostic = {
        from: targetStart,
        to: targetStart + target.length,
        message: `No heading matches the anchor "#${anchor}".`,
        severity: 'warning',
        code: 'bad-anchor'
      };
      // Only offer the fix when the nearest heading is genuinely close.
      if (nearest && nearest.d <= Math.max(2, anchor.length / 2)) {
        diag.message += ` Did you mean "#${nearest.s}"?`;
        diag.fix = {
          title: `Change to "#${nearest.s}"`,
          from: targetStart,
          to: targetStart + target.length,
          text: `#${nearest.s}`
        };
      }
      out.push(diag);
    }
  }
}

function checkUnclosedComment(text: string, out: Diagnostic[]): void {
  const skip = codeRanges(text); // fences *and* inline code — `<!--` shown in code is documentation
  const re = /<!--/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (inRanges(m.index, skip)) continue;
    const close = text.indexOf('-->', m.index);
    if (close === -1) {
      out.push({
        from: m.index,
        to: Math.min(text.length, m.index + 4),
        message: 'HTML comment is never closed (missing "-->").',
        severity: 'error',
        code: 'unclosed-html'
      });
    }
  }
}

/** Balance the block-level HTML tags OMD relies on for its coexistence forms. */
function checkUnbalancedTags(text: string, out: Diagnostic[]): void {
  const skip = codeRanges(text); // fences *and* inline code — `<details>` shown in code is documentation
  for (const tag of ['details', 'table'] as const) {
    const opens: number[] = [];
    const re = new RegExp(`<(/?)${tag}(?:\\s[^>]*)?>`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (inRanges(m.index, skip)) continue;
      if (m[1] === '/') {
        if (opens.length) opens.pop();
        else
          out.push({
            from: m.index,
            to: m.index + m[0].length,
            message: `Closing </${tag}> has no matching <${tag}>.`,
            severity: 'warning',
            code: 'unbalanced-html'
          });
      } else {
        opens.push(m.index);
      }
    }
    for (const pos of opens) {
      out.push({
        from: pos,
        to: pos + tag.length + 2,
        message: `<${tag}> is never closed.`,
        severity: 'warning',
        code: 'unbalanced-html'
      });
    }
  }
}

/** Run every text-only check and return the diagnostics, ordered by position. */
export function diagnose(text: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  checkFrontMatter(text, out);
  checkLinks(text, out);
  checkUnclosedComment(text, out);
  checkUnbalancedTags(text, out);
  return out.sort((a, b) => a.from - b.from);
}

/** Relative link targets worth a filesystem check (skip URLs, anchors, and mail links). */
export function fileLinkTargets(text: string): Array<{ target: string; from: number; to: number }> {
  const skip = codeRanges(text);
  const out: Array<{ target: string; from: number; to: number }> = [];
  let m: RegExpExecArray | null;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(text))) {
    if (inRanges(m.index, skip)) continue;
    const target = m[2].trim();
    if (!target || /^(https?:|mailto:|#|\/\/)/i.test(target)) continue;
    // Strip an in-file anchor and any title.
    const path = target.split('#')[0].split(/\s+/)[0];
    if (!path || /^[a-z]+:/i.test(path)) continue;
    const targetStart = m.index + m[0].indexOf('(') + 1;
    out.push({ target: path, from: targetStart, to: targetStart + target.length });
  }
  return out;
}
