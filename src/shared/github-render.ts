import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import remarkMath from 'remark-math';
import { remarkAlert } from 'remark-github-blockquote-alert';
import remarkHtml, { type Options as RemarkHtmlOptions } from 'remark-html';
import remarkGemoji from 'remark-gemoji';
import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import githubDark from 'shiki/themes/github-dark-default.mjs';
import githubLight from 'shiki/themes/github-light-default.mjs';
import { load as loadYaml } from 'js-yaml';
import { SHIKI_LANGS, resolveLang } from './shiki-langs';
import { slugify } from './diagnostics';
import { WIKILINK_RE, parseWikilink } from './references';

/**
 * The shared "render like GitHub" pipeline (showcase/BUGS.md "GitHub preview fidelity"). One markdown →
 * GitHub-faithful HTML transform used by both the static HTML export (host, `host/export.ts`) and
 * the live preview panel. Environment differences are injected: LaTeX rendering (the export uses
 * MathJax SVG, the panel can use KaTeX) via `renderMath`. Everything else is identical, so the two
 * surfaces can never drift.
 *
 * What it adds over bare remark-html:
 *   - GitHub **alerts** (`> [!NOTE]`) → `.markdown-alert` markup (styled by github-markdown-css).
 *   - **Syntax highlighting** via Shiki (inline styles + light/dark CSS vars, no external CSS).
 *   - **Frontmatter** → a key/value table (as GitHub renders it), instead of being dropped.
 *   - **Mermaid** fences → `<pre class="mermaid">` so a mermaid runtime (the panel, or an inlined
 *     script in the export) renders them; without one they degrade to readable source.
 *   - **Emoji shortcodes** (`:tada:` → 🎉) via remark-gemoji (GitHub's set).
 *   - **Heading anchors** — GitHub-style `id` on every heading, for in-page `#links` and TOCs.
 *   - **Wikilinks** (`[[Page]]`, `[[label|target]]`) → real links (as a GitHub *Wiki* renders them).
 *   - Raw HTML passthrough (`sanitize: false`) so OMD's coexistence forms render for real.
 */

export interface GitHubRenderOptions {
  /** Render LaTeX to self-contained HTML. Omit to leave math as literal `$…$` text. */
  renderMath?: (tex: string, display: boolean) => string;
  /** The document's GitHub `owner/repo`, so bare `#123` autolinks to the issue (like GitHub). */
  repoSlug?: { owner: string; repo: string };
  /**
   * Extra remark transform plugins inserted just before HTML serialization. The OMD-look export
   * passes its block transform here (`shared/omd-blocks.ts`); the GitHub preview passes none, so
   * the two surfaces share one pipeline and differ only by this hook.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extraRemarkPlugins?: Array<() => (tree: any) => void>;
}

interface MdNode {
  type: string;
  value?: string;
  lang?: string | null;
  depth?: number;
  url?: string;
  data?: { hProperties?: Record<string, string> };
  children?: MdNode[];
}

/** Plain text of a node's subtree (for computing a heading's slug). */
function nodeText(node: MdNode): string {
  if (typeof node.value === 'string') return node.value;
  return (node.children ?? []).map(nodeText).join('');
}

/** Set a GitHub-style `id` on every heading (de-duplicated), so `#anchor` links and TOCs work. */
function headingAnchors() {
  return (tree: MdNode) => {
    const seen = new Map<string, number>();
    walk(tree, (node) => {
      if (node.type !== 'heading') return;
      const base = slugify(nodeText(node));
      if (!base) return;
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      const id = n === 0 ? base : `${base}-${n}`;
      node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id } };
    });
  };
}

/** A GitHub-Wiki page link: spaces → dashes, case preserved (`Big Roadmap` → `Big-Roadmap`). */
function wikiHref(target: string): string {
  return target.trim().replace(/\.md$/i, '').replace(/\s+/g, '-');
}

/**
 * Autolink bare `@mention` and `#123` in text nodes, as GitHub does — but only in a repo context
 * (a known `owner/repo`), matching GitHub, which doesn't autolink these outside a repo. `@name` →
 * the GitHub profile, `#123` → the repo's issue. The word-boundary guard (`(?<![\w@#/])`) keeps it
 * off email locals (`a@b`) and `path/#frag`.
 */
function mentionsAndIssues(repoSlug?: { owner: string; repo: string }) {
  const TOKEN = /(?<![\w@#/])(@[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}|#\d+)/gi;
  const linkFor = (tok: string): MdNode => {
    const url =
      tok[0] === '@'
        ? `https://github.com/${tok.slice(1)}`
        : `https://github.com/${repoSlug!.owner}/${repoSlug!.repo}/issues/${tok.slice(1)}`;
    return { type: 'link', url, children: [{ type: 'text', value: tok }] };
  };
  const process = (children: MdNode[]): MdNode[] => {
    const out: MdNode[] = [];
    for (const node of children) {
      if (node.type === 'text' && typeof node.value === 'string' && /[@#]/.test(node.value)) {
        const text = node.value;
        TOKEN.lastIndex = 0;
        let last = 0;
        let m: RegExpExecArray | null;
        while ((m = TOKEN.exec(text))) {
          if (m.index > last) out.push({ type: 'text', value: text.slice(last, m.index) });
          out.push(linkFor(m[1]));
          last = m.index + m[1].length;
        }
        if (last === 0) out.push(node);
        else if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
        continue;
      }
      if (node.children) node.children = process(node.children);
      out.push(node);
    }
    return out;
  };
  return (tree: MdNode) => {
    if (!repoSlug) return; // GitHub only autolinks @/# in a repo context
    if (tree.children) tree.children = process(tree.children);
  };
}

/** Split `[[Page]]` / `[[label|target]]` in text nodes into real links (GitHub-Wiki behaviour). */
function wikilinks() {
  const linkify = (children: MdNode[]): MdNode[] => {
    const out: MdNode[] = [];
    for (const node of children) {
      if (node.type === 'text' && typeof node.value === 'string' && node.value.includes('[[')) {
        const text = node.value;
        WIKILINK_RE.lastIndex = 0;
        let last = 0;
        let m: RegExpExecArray | null;
        while ((m = WIKILINK_RE.exec(text))) {
          if (m.index > last) out.push({ type: 'text', value: text.slice(last, m.index) });
          const { label, target } = parseWikilink(m[1] + (m[2] !== undefined ? `|${m[2]}` : ''));
          out.push({ type: 'link', url: wikiHref(target), children: [{ type: 'text', value: label }] });
          last = m.index + m[0].length;
        }
        if (last === 0) out.push(node);
        else if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
        continue;
      }
      if (node.children) node.children = linkify(node.children);
      out.push(node);
    }
    return out;
  };
  return (tree: MdNode) => {
    if (tree.children) tree.children = linkify(tree.children);
  };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Depth-first walk that lets the visitor mutate nodes in place. */
function walk(node: MdNode, visit: (n: MdNode) => void): void {
  visit(node);
  if (node.children) for (const child of node.children) walk(child, visit);
}

// --- Shiki highlighter singleton (shared with the editor's language set) ---
let hl: HighlighterCore | null = null;
let hlLoading: Promise<HighlighterCore> | null = null;
function highlighter(): Promise<HighlighterCore> {
  if (hl) return Promise.resolve(hl);
  if (!hlLoading) {
    hlLoading = createHighlighterCore({
      themes: [githubLight, githubDark],
      langs: SHIKI_LANGS,
      engine: createJavaScriptRegexEngine()
    }).then((h) => (hl = h));
  }
  return hlLoading;
}

/** Frontmatter YAML → a key/value table, matching how GitHub renders front matter. */
function frontmatterTable() {
  return (tree: MdNode) => {
    walk(tree, (node) => {
      if (node.type !== 'yaml' || typeof node.value !== 'string') return;
      let data: unknown;
      try {
        data = loadYaml(node.value);
      } catch {
        data = null;
      }
      node.type = 'html';
      if (!data || typeof data !== 'object') {
        node.value = '';
        return;
      }
      const rows = Object.entries(data as Record<string, unknown>)
        .map(([k, v]) => {
          const val = v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v);
          return `<tr><th align="left">${esc(k)}</th><td>${esc(val)}</td></tr>`;
        })
        .join('');
      node.value = `<table class="omd-frontmatter"><tbody>${rows}</tbody></table>`;
    });
  };
}

/** Highlight code fences to inline-styled HTML (async); mermaid fences become `<pre class="mermaid">`. */
function shikiHighlight() {
  return async (tree: MdNode) => {
    const jobs: Array<Promise<void>> = [];
    walk(tree, (node) => {
      if (node.type !== 'code' || typeof node.value !== 'string') return;
      if ((node.lang ?? '').toLowerCase() === 'mermaid') {
        const code = node.value;
        node.type = 'html';
        node.value = `<pre class="mermaid">${esc(code)}</pre>`;
        return;
      }
      const lang = resolveLang(node.lang);
      if (!lang) return; // unknown language → leave as a normal (unstyled) code block
      const code = node.value;
      jobs.push(
        highlighter().then((h) => {
          try {
            node.value = h.codeToHtml(code, {
              lang,
              themes: { light: 'github-light-default', dark: 'github-dark-default' },
              defaultColor: false // emit --shiki-light / --shiki-dark vars for light/dark switching
            });
            node.type = 'html';
          } catch {
            /* grammar failed at runtime — leave the original code block */
          }
        })
      );
    });
    await Promise.all(jobs);
  };
}

/** Render a markdown body to a GitHub-faithful HTML fragment (no document shell). */
export async function renderGitHubHtml(
  markdown: string,
  opts: GitHubRenderOptions = {}
): Promise<string> {
  const htmlOptions: RemarkHtmlOptions = {
    sanitize: false,
    handlers: {
      inlineMath: (_state: unknown, node: { value: string }) => ({
        type: 'raw',
        value: opts.renderMath ? opts.renderMath(node.value, false) : esc(node.value)
      }),
      math: (_state: unknown, node: { value: string }) => ({
        type: 'raw',
        value: opts.renderMath ? opts.renderMath(node.value, true) : esc(node.value)
      })
    }
  };

  let pipeline = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(frontmatterTable)
    .use(remarkGfm)
    .use(remarkGemoji)
    .use(remarkAlert)
    .use(remarkMath)
    .use(wikilinks)
    .use(() => mentionsAndIssues(opts.repoSlug))
    .use(headingAnchors)
    .use(shikiHighlight);
  for (const plugin of opts.extraRemarkPlugins ?? []) pipeline = pipeline.use(plugin);
  const file = await pipeline.use(remarkHtml, htmlOptions).process(markdown);
  return titleCaseAlertLabels(String(file));
}

// The alert plugin labels the callout in upper case (`WARNING`); GitHub uses title case
// (`Warning`). Scope the fix to the alert-title element so a literal "WARNING" in prose is untouched.
const ALERT_LABEL = /(class="markdown-alert-title"[^>]*>(?:<svg[\s\S]*?<\/svg>)?)(NOTE|TIP|IMPORTANT|WARNING|CAUTION)/g;
function titleCaseAlertLabels(html: string): string {
  return html.replace(ALERT_LABEL, (_all, prefix: string, kind: string) => {
    return prefix + kind.charAt(0) + kind.slice(1).toLowerCase();
  });
}

/**
 * CSS that pairs with the Shiki output (`defaultColor: false`): apply the light theme's inline
 * vars by default and the dark theme's under a dark color scheme. Injected by each surface's shell.
 */
export const SHIKI_CSS = `
.shiki, .shiki span { color: var(--shiki-light); background-color: var(--shiki-light-bg); }
@media (prefers-color-scheme: dark) {
  .shiki, .shiki span { color: var(--shiki-dark) !important; background-color: var(--shiki-dark-bg) !important; }
}
.shiki { padding: 16px; overflow: auto; border-radius: 6px; }
.omd-frontmatter { margin-bottom: 16px; }
`;
