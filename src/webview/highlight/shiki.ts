import type { HighlighterCore } from 'shiki/core';
import type * as ShikiSidecar from '../lazy/shiki';
import { resolveLang } from '../../shared/shiki-langs';
import { loadGlobal } from '../lazy/sidecar';

/**
 * Syntax highlighting with Shiki (docs/design/DEPENDENCIES.md): VS Code's own TextMate grammars
 * and themes, so code matches the user's editor — not highlight.js/Prism, which don't.
 * The JavaScript regex engine avoids shipping WASM. The fence-infostring aliases live in
 * `shared/shiki-langs.ts`, shared with the HTML export and GitHub preview renderer.
 *
 * The engine, themes and grammars (~1.3 MB) are a sidecar bundle loaded on demand — only a
 * document with a fenced code block in a language we know pays for them (`lazy/sidecar.ts`).
 */
declare global {
  interface Window {
    /** Set by `media/omd-shiki.js`. */
    omdShiki?: typeof ShikiSidecar;
  }
}

export { resolveLang };

let highlighter: HighlighterCore | null = null;
let loading: Promise<HighlighterCore> | null = null;

/** Load the highlighter once. Idempotent; concurrent callers share one promise. */
export function ensureHighlighter(): Promise<HighlighterCore> {
  if (highlighter) return Promise.resolve(highlighter);
  if (!loading) {
    loading = loadGlobal('omd-shiki.js', () => window.omdShiki)
      .then((sidecar) => sidecar.createOmdHighlighter())
      .then((h) => {
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
