import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import githubDark from 'shiki/themes/github-dark-default.mjs';
import githubLight from 'shiki/themes/github-light-default.mjs';
import { SHIKI_LANGS } from '../../shared/shiki-grammars';

/**
 * The Shiki sidecar: engine, both GitHub themes, and the curated grammars, bundled on their own
 * (`esbuild.mjs` → `media/omd-shiki.js`, global `omdShiki`) and loaded only when a document
 * actually has a fenced code block to highlight (`webview/highlight/shiki.ts`).
 */
export function createOmdHighlighter(): Promise<HighlighterCore> {
  return createHighlighterCore({
    themes: [githubDark, githubLight],
    langs: SHIKI_LANGS,
    engine: createJavaScriptRegexEngine()
  });
}
