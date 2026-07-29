/**
 * Inline references (docs/design/FORMATS.md). Mentions and issues are **always real links on disk**,
 * never bare tokens, so they resolve for every reader — GitHub included. Wikilinks are the one
 * OMD-specific inline form, and OMD renders them as links while keeping the `[[…]]` bytes.
 *
 *   [[Roadmap]]                 → label "Roadmap", target `Roadmap`
 *   [[the plan|Roadmap]]        → label **before** the pipe, target **after**
 *   [@alice](https://github.com/alice)
 *   [#123](https://github.com/<owner>/<repo>/issues/123)
 *
 * The wikilink pipe order is deliberately label-first, which is the opposite of Obsidian's
 * target-first convention — FORMATS.md fixes it, so it is pinned by tests.
 */

/** Scans text for `[[…]]`; `g` for iteration, so callers must reset `lastIndex`. */
export const WIKILINK_RE = /\[\[([^\][|]+)(?:\|([^\]]+))?\]\]/g;

export interface Wikilink {
  label: string;
  target: string;
}

/** Parse the inside of a `[[…]]` — label before the pipe, target after. */
export function parseWikilink(inner: string): Wikilink {
  const pipe = inner.indexOf('|');
  if (pipe === -1) {
    const t = inner.trim();
    return { label: t, target: t };
  }
  return { label: inner.slice(0, pipe).trim(), target: inner.slice(pipe + 1).trim() };
}

/** Render a wikilink, collapsing to the short form when label and target agree. */
export function formatWikilink(label: string, target: string): string {
  return label === target ? `[[${target}]]` : `[[${label}|${target}]]`;
}

/** `[@alice](https://github.com/alice)` — a real link, not a bare token. */
export function mentionLink(user: string): string {
  const name = user.replace(/^@/, '');
  return `[@${name}](https://github.com/${name})`;
}

/** `[#123](https://github.com/<owner>/<repo>/issues/123)`. */
export function issueLink(issue: string | number, owner: string, repo: string): string {
  const n = String(issue).replace(/^#/, '');
  return `[#${n}](https://github.com/${owner}/${repo}/issues/${n})`;
}

const MENTION_HREF = /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/?$/;
const ISSUE_HREF = /^https?:\/\/(?:www\.)?github\.com\/[\w.-]+\/[\w.-]+\/issues\/(\d+)\/?$/;

/** True when a link is a mention — `@name` text pointing at that GitHub profile. */
export function isMentionLink(text: string, href: string): boolean {
  const m = MENTION_HREF.exec(href);
  return !!m && text.trim() === `@${m[1]}`;
}

/** True when a link is an issue reference — `#123` text pointing at that issue. */
export function isIssueLink(text: string, href: string): boolean {
  const m = ISSUE_HREF.exec(href);
  return !!m && text.trim() === `#${m[1]}`;
}

/** A page elsewhere in the workspace that links here. */
export interface Backlink {
  /** Workspace-relative path of the linking page. */
  path: string;
  /** Display title (the linking page's file name, without `.md`). */
  title: string;
  /** The label the link was written with, which is often the useful context. */
  label: string;
}

/** Every wikilink in a markdown string, as {label, target} pairs. */
export function collectWikilinks(text: string): Wikilink[] {
  const out: Wikilink[] = [];
  WIKILINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WIKILINK_RE.exec(text))) {
    out.push(parseWikilink(m[1] + (m[2] !== undefined ? `|${m[2]}` : '')));
  }
  return out;
}

/**
 * The bare, comparable form of a page name or wikilink target: no folder, no `.md`, lower-cased,
 * and with spaces folded to dashes. The space↔dash fold is the GitHub-wiki convention — a page
 * titled "Getting Started" is stored as `Getting-Started.md`, and `[[Getting Started]]`,
 * `[[Getting-Started]]`, and `[[getting started]]` must all resolve to it.
 */
export function pageSlug(s: string): string {
  return s
    .trim()
    .replace(/\.md$/i, '')
    .split(/[\\/]/)
    .pop()!
    .toLowerCase()
    .replace(/ /g, '-');
}

/**
 * Whether a wikilink target refers to the given page. Targets are written loosely — with or
 * without `.md`, with or without a folder, in any case, and with spaces or dashes — so matching
 * compares the normalized page slug.
 */
export function targetMatchesPage(target: string, pageName: string): boolean {
  return pageSlug(target) === pageSlug(pageName);
}

/**
 * Candidate `.md`-less page names a wikilink target could name on disk, GitHub-wiki style (spaces
 * are interchangeable with dashes). Folders in the target are preserved; ordered most-literal
 * first and deduped, for a host to try in turn when resolving a click.
 */
export function wikiTargetCandidates(target: string): string[] {
  const raw = target.trim().replace(/\.md$/i, '');
  return [...new Set([raw, raw.replace(/ /g, '-')].filter(Boolean))];
}

/** Split `owner/repo` (as VS Code would report a workspace remote), or null. */
export function parseRepoSlug(slug: string): { owner: string; repo: string } | null {
  const m = /^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/.exec(slug.trim());
  return m ? { owner: m[1], repo: m[2] } : null;
}
