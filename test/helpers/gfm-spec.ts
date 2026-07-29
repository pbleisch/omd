import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Parser for the vendored GFM spec example suite (`test/fixtures/gfm-spec/spec.txt`). Each example
 * is fenced with a long backtick run + `example[ <extension>]`, its markdown input and expected HTML
 * separated by a lone `.`. A `→` stands for a TAB (the CommonMark convention). `disabled` examples
 * are skipped but still counted, so `example` numbers match the spec. See the fixture's README.
 */

export interface SpecExample {
  /** Sequential spec example number (matches cmark-gfm's `spec_tests.py`). */
  example: number;
  /** The nearest preceding heading, e.g. "HTML blocks", "Raw HTML". */
  section: string;
  /** GFM extension tag on the fence (`table`, `tagfilter`, `autolink`, …), or null for core. */
  extension: string | null;
  markdown: string;
  html: string;
}

const SPEC_PATH = join(__dirname, '..', 'fixtures', 'gfm-spec', 'spec.txt');

/** Long backtick run avoids matching an inner (short) code fence as an example fence. */
const OPEN = /^(`{10,})\s*example(?:\s+(\S+))?\s*$/;
const HEADING = /^#{1,6}\s+(.*?)\s*$/;
const untab = (s: string): string => s.replace(/→/g, '\t');

let cache: SpecExample[] | null = null;

export function loadSpec(): SpecExample[] {
  if (cache) return cache;
  const lines = readFileSync(SPEC_PATH, 'utf8').split('\n');
  const out: SpecExample[] = [];
  let section = '';
  let count = 0;
  let i = 0;
  while (i < lines.length) {
    const heading = HEADING.exec(lines[i]);
    if (heading) {
      section = heading[1];
      i++;
      continue;
    }
    const open = OPEN.exec(lines[i]);
    if (!open) {
      i++;
      continue;
    }
    const fence = open[1];
    const extension = open[2] ?? null;
    i++;
    const md: string[] = [];
    while (i < lines.length && lines[i] !== '.') md.push(lines[i++]);
    i++; // the '.' separator
    const html: string[] = [];
    while (i < lines.length && lines[i] !== fence) html.push(lines[i++]);
    i++; // the closing fence
    count++;
    if (extension === 'disabled') continue;
    out.push({
      example: count,
      section,
      extension,
      markdown: untab(md.length ? md.join('\n') + '\n' : ''),
      html: untab(html.length ? html.join('\n') + '\n' : '')
    });
  }
  cache = out;
  return out;
}

/** Examples whose section title matches `re`. */
export function examplesInSections(re: RegExp): SpecExample[] {
  return loadSpec().filter((e) => re.test(e.section));
}

/** The raw-HTML-relevant sections — the target of the general raw-HTML work. */
export const RAW_HTML_SECTIONS = /^(HTML blocks|Raw HTML|Disallowed Raw HTML|Entity and numeric)/;
