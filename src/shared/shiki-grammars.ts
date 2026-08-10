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
 * The TextMate grammars themselves — ~1.2 MB of data, kept in their own module so importing the
 * *alias table* (`shiki-langs.ts`, which every code fence consults) doesn't drag them in. Only a
 * surface that is actually about to highlight loads this: the webview's Shiki sidecar
 * (`webview/lazy/shiki.ts`) and the host's GitHub renderer.
 */
export const SHIKI_LANGS = [ts, js, tsx, jsx, json, html, css, python, bash, markdown, yaml, rust, go, sql];
