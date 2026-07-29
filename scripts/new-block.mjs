#!/usr/bin/env node
// Scaffold a new OMD smart block into a discovery directory.
// Usage:  npm run new:block -- <name> [--kind leaf|container] [--tier template|sandboxed]
//                                     [--title "..."] [--group "..."] [--icon <codicon>]
//                                     [--out <dir>] [--user] [--force]
// Docs:   docs/contributing/AUTHORING-SMART-BLOCKS.md
//
// Zero dependencies; pure Node. It writes a valid block.json (and render.js for the sandboxed
// tier) — the same shape the host discovers and the AUTHORING guide documents.

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { homedir } from 'node:os';

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/; // mirrors src/shared/blocks.ts

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function usage() {
  console.log(
    `Scaffold a new OMD smart block.

  npm run new:block -- <name> [options]

Options:
  --kind <leaf|container>       leaf = one tag; container wraps a markdown body   (default: leaf)
  --tier <template|sandboxed>   render tier for a leaf block                       (default: template)
  --title "<Title>"             menu/header label                                 (default: from name)
  --group "<Group>"             slash-menu group heading                          (default: Custom)
  --icon <codicon>              codicon name for chrome (never emoji)             (default: symbol-misc)
  --out <dir>                   base blocks dir                                   (default: .omd/blocks)
  --user                        scaffold into ~/.omd/blocks instead
  --force                       overwrite an existing block directory

A container renders as chrome over an editable markdown body, so --tier applies to leaf only.`
  );
}

// --- parse args ---------------------------------------------------------------
const argv = process.argv.slice(2);
if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
  usage();
  process.exit(argv.length === 0 ? 1 : 0);
}

const opts = { kind: 'leaf', tier: 'template', group: 'Custom', icon: 'symbol-misc' };
let name;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--user') opts.user = true;
  else if (a === '--force') opts.force = true;
  else if (a.startsWith('--')) {
    const key = a.slice(2);
    const val = argv[++i];
    if (val === undefined) fail(`--${key} needs a value`);
    opts[key] = val;
  } else if (!name) {
    name = a;
  } else {
    fail(`unexpected argument: ${a}`);
  }
}

// --- validate -----------------------------------------------------------------
if (!name) fail('a block name is required (lowercase, digits, dashes)');
if (!NAME_RE.test(name)) fail(`invalid name "${name}" — must match ${NAME_RE}`);
if (opts.kind !== 'leaf' && opts.kind !== 'container') fail('--kind must be leaf or container');
if (opts.tier !== 'template' && opts.tier !== 'sandboxed') fail('--tier must be template or sandboxed');
if (opts.kind === 'container' && argv.includes('--tier')) {
  console.warn('note: --tier is ignored for a container (its body is editable markdown, not a render tier).');
}

const base = opts.user
  ? join(homedir(), '.omd', 'blocks')
  : isAbsolute(opts.out ?? '')
    ? opts.out
    : join(process.cwd(), opts.out ?? join('.omd', 'blocks'));
const dir = join(base, name);

if (existsSync(dir) && !opts.force) {
  fail(`${dir} already exists (pass --force to overwrite)`);
}

// --- build manifest -----------------------------------------------------------
const title = opts.title ?? name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, ' ');
const sandboxed = opts.kind === 'leaf' && opts.tier === 'sandboxed';

const manifest = {
  name,
  title,
  kind: opts.kind,
  icon: opts.icon,
  group: opts.group,
  keywords: [name],
  defaultParams: { text: '' },
  params: [{ name: 'text', label: 'Text', type: 'string', required: true }]
};

if (opts.kind === 'container') {
  // A container's body is editable markdown; it needs no params, template, or script.
  manifest.defaultParams = {};
  delete manifest.params;
} else if (sandboxed) {
  manifest.trust = 'sandboxed';
} else {
  manifest.trust = 'template';
  manifest.template =
    `<span style="display:inline-block;padding:1px 8px;border-radius:4px;` +
    `background:var(--vscode-textCodeBlock-background,#2226)">{{text}}</span>`;
}

const RENDER_JS = `// Sandboxed render code for the "${name}" block. Runs in an isolated iframe with only
// \`params\` and \`root\` in scope — no network, no access to the editor's DOM, cookies, or
// storage. Build DOM under \`root\`; never inject untrusted strings as HTML.
// See docs/contributing/AUTHORING-SMART-BLOCKS.md.

var el = document.createElement('div');
el.textContent = String(params.text != null ? params.text : '');
root.appendChild(el);
`;

// --- write --------------------------------------------------------------------
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'block.json'), JSON.stringify(manifest, null, 2) + '\n');
if (sandboxed) writeFileSync(join(dir, 'render.js'), RENDER_JS);

// --- report -------------------------------------------------------------------
const rel = dir.startsWith(process.cwd()) ? dir.slice(process.cwd().length + 1) : dir;
console.log(`Scaffolded ${opts.kind} block "${name}" (${opts.kind === 'container' ? 'markdown body' : opts.tier + ' tier'})`);
console.log(`  ${join(rel, 'block.json')}`);
if (sandboxed) console.log(`  ${join(rel, 'render.js')}`);
console.log(`
Next:
  1. Edit ${sandboxed ? 'render.js' : 'block.json'} to implement the block.
  2. Open a .md file in an OMD Extension Development Host (F5); the block is in the
     slash menu under "${manifest.group}".
  3. Insert it, then save with no further edit — the file must round-trip byte-for-byte.
  Guide: docs/contributing/AUTHORING-SMART-BLOCKS.md`);
