import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import githubDark from 'shiki/themes/github-dark-default.mjs';
import githubLight from 'shiki/themes/github-light-default.mjs';
import { SHIKI_LANGS, resolveLang } from '../../shared/shiki-langs';

/**
 * Syntax highlighting with Shiki (docs/design/DEPENDENCIES.md): VS Code's own TextMate grammars
 * and themes, so code matches the user's editor — not highlight.js/Prism, which don't.
 * The JavaScript regex engine avoids shipping WASM. The curated language set + aliases live in
 * `shared/shiki-langs.ts`, shared with the HTML export and GitHub preview renderer.
 */

export { resolveLang };

let highlighter: HighlighterCore | null = null;
let loading: Promise<HighlighterCore> | null = null;

/** Load the highlighter once. Idempotent; concurrent callers share one promise. */
export function ensureHighlighter(): Promise<HighlighterCore> {
  if (highlighter) return Promise.resolve(highlighter);
  if (!loading) {
    loading = createHighlighterCore({
      themes: [githubDark, githubLight],
      langs: SHIKI_LANGS,
      engine: createJavaScriptRegexEngine()
    }).then((h) => {
      highlighter = h;
      return h;
    });
  }
  return loading;
}

/** Ready-or-null accessor for synchronous decoration building. */
export function getHighlighter(): HighlighterCore | null {
  return highlighter;
}

/** The Shiki theme matching the current VS Code theme kind. */
export function currentTheme(): string {
  const cls = document.body.classList;
  if (cls.contains('vscode-light')) return 'github-light-default';
  return 'github-dark-default';
}
