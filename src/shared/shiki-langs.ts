/**
 * The fence-infostring aliases for OMD's curated Shiki language set, shared by every place OMD
 * highlights code: the editor's inline decorations (`webview/highlight/shiki.ts`), the HTML export,
 * and the GitHub preview renderer (`shared/github-render.ts`). One source so they never drift.
 * Unknown languages fall back to plain (styled) text rather than failing.
 *
 * Deliberately data-free: the grammars themselves are ~1.2 MB and live in `shiki-grammars.ts`, so
 * asking "is this fence a language I know?" costs nothing until something actually highlights.
 */

/** The two GitHub themes OMD uses (imported by the environment that needs them). */
export const SHIKI_THEMES = ['github-light-default', 'github-dark-default'] as const;

const ALIASES: Record<string, string> = {
  typescript: 'typescript',
  ts: 'typescript',
  javascript: 'javascript',
  js: 'javascript',
  node: 'javascript',
  jsx: 'jsx',
  tsx: 'tsx',
  json: 'json',
  jsonc: 'json',
  html: 'html',
  xml: 'html',
  css: 'css',
  scss: 'css',
  python: 'python',
  py: 'python',
  bash: 'bash',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  markdown: 'markdown',
  md: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  rust: 'rust',
  rs: 'rust',
  go: 'go',
  golang: 'go',
  sql: 'sql'
};

/** Resolve a fence infostring to a bundled grammar id, or null if unsupported. */
export function resolveLang(info: string | null | undefined): string | null {
  if (!info) return null;
  return ALIASES[info.trim().toLowerCase()] ?? null;
}
