/**
 * Shiki ships its `./core`, `./engine/*`, `./langs/*.mjs` and `./themes/*.mjs` entry points through
 * the package `exports` map. The host `tsc` uses classic "Node" module resolution, which doesn't
 * read export maps, so it can't find them — but esbuild (the real bundler for both host and webview)
 * resolves them correctly. These ambient declarations satisfy the typechecker without changing the
 * project's module-resolution mode.
 */
declare module 'shiki/core' {
  export interface HighlighterCore {
    codeToHtml(code: string, options: unknown): string;
    codeToTokensBase(code: string, options: unknown): Array<Array<{ content: string; color?: string }>>;
  }
  export function createHighlighterCore(options: unknown): Promise<HighlighterCore>;
}
declare module 'shiki/engine/javascript' {
  export function createJavaScriptRegexEngine(): unknown;
}
declare module 'shiki/langs/*.mjs' {
  const lang: unknown;
  export default lang;
}
declare module 'shiki/themes/*.mjs' {
  const theme: unknown;
  export default theme;
}
