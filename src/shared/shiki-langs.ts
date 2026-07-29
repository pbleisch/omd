import ts from 'shiki/langs/typescript.mjs';
import js from 'shiki/langs/javascript.mjs';
import tsx from 'shiki/langs/tsx.mjs';
import jsx from 'shiki/langs/jsx.mjs';
import json from 'shiki/langs/json.mjs';
import html from 'shiki/langs/html.mjs';
import css from 'shiki/langs/css.mjs';
import python from 'shiki/langs/python.mjs';
import bash from 'shiki/langs/bash.mjs';
import markdown from 'shiki/langs/markdown.mjs';
import yaml from 'shiki/langs/yaml.mjs';
import rust from 'shiki/langs/rust.mjs';
import go from 'shiki/langs/go.mjs';
import sql from 'shiki/langs/sql.mjs';

/**
 * The curated Shiki language set and fence-infostring aliases, shared by every place OMD
 * highlights code: the editor's inline decorations (`webview/highlight/shiki.ts`), the HTML export,
 * and the GitHub preview renderer (`shared/github-render.ts`). One source so they never drift.
 * Unknown languages fall back to plain (styled) text rather than failing.
 */
export const SHIKI_LANGS = [ts, js, tsx, jsx, json, html, css, python, bash, markdown, yaml, rust, go, sql];

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
