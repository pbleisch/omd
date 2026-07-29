/**
 * The smart-block definition contract, shared by host and editor (docs/design/SMART-BLOCKS.md).
 * The host discovers definitions across three layers, resolves them (first match wins),
 * and pushes the resolved set to the editor; the editor offers them in the slash menu and
 * renders their shortcodes. Keeping the shape and the resolution rule here means the two
 * processes agree on what a block *is*.
 */

/** Which of the three discovery layers a definition came from (docs/design/DECISIONS.md). */
export type BlockSource = 'workspace' | 'user' | 'shipped';

/** How a block's output is produced — the trust tier (docs/design/SMART-BLOCKS.md, "Safety"). */
export type BlockTrust = 'template' | 'builtin' | 'sandboxed';

/**
 * The editable-parameter kinds. These line up 1:1 with the webview's field renderers
 * (webview/ui/fields.ts) so a param's declared `type` maps to exactly one control in the
 * property panel. Kept here in the shared contract because the host validates manifests.
 */
export type ParamType = 'string' | 'number' | 'boolean' | 'enum' | 'color' | 'date';

/** One editable parameter a block declares, driving a row in the property panel (Phase 2). */
export interface ParamDef {
  /** Key under which the value is stored in the shortcode's params object. */
  name: string;
  /** Human label; falls back to `name`. */
  label?: string;
  type: ParamType;
  /** Seed value when the stored params don't carry one. */
  default?: unknown;
  /** Choices for an `enum` field. */
  options?: string[];
  /** Must be filled before the block can be inserted (collected via a prompt on insert). */
  required?: boolean;
}

const PARAM_TYPES: ReadonlySet<string> = new Set([
  'string',
  'number',
  'boolean',
  'enum',
  'color',
  'date'
]);

/** Validate a manifest's `params` array into `ParamDef[]`; drops malformed entries. */
function parseParamDefs(raw: unknown): ParamDef[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const defs: ParamDef[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const o = entry as Record<string, unknown>;
    if (typeof o.name !== 'string' || !o.name) continue;
    if (typeof o.type !== 'string' || !PARAM_TYPES.has(o.type)) continue;
    defs.push({
      name: o.name,
      label: typeof o.label === 'string' ? o.label : undefined,
      type: o.type as ParamType,
      default: 'default' in o ? o.default : undefined,
      options: Array.isArray(o.options)
        ? o.options.filter((v): v is string => typeof v === 'string')
        : undefined,
      required: o.required === true ? true : undefined
    });
  }
  return defs.length ? defs : undefined;
}

export interface BlockDefinition {
  /** The shortcode identity: `<!-- omd:<name> … -->`. Lowercase, digits, dashes. */
  name: string;
  /** Human label for the slash menu and block header. */
  title: string;
  /** Leaf (single tag) or container (wraps a markdown body). */
  kind: 'leaf' | 'container';
  /** Codicon for chrome (never emoji — docs/design/STYLE.md). */
  icon?: string;
  /** Slash-menu group heading. */
  group?: string;
  /** Extra slash-menu search terms. */
  keywords?: string[];
  /** Params written when the block is inserted; present even when `{}`. */
  defaultParams?: Record<string, unknown>;
  /** Typed, editable parameters exposed in the property panel (Phase 2). */
  params?: ParamDef[];
  /** Template-tier output source (safe eval-free subset — see webview/blocks/template). */
  template?: string;
  /** Author render code (JS body with `params`/`root` in scope); runs only sandboxed. */
  script?: string;
  /** Trust tier for rendering. Discovered code is never trusted as built-in. */
  trust: BlockTrust;
  /** Set during resolution; not authored. */
  source: BlockSource;
}

/** A block name: lowercase, digits, dashes. May start with a digit (`2col`, `3col`). */
const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Validate and normalize a parsed manifest into a BlockDefinition, or null if invalid.
 * `source` is stamped by the caller (the layer it was found in). Discovered blocks are
 * never granted `builtin` trust — only shipped definitions may claim it.
 */
export function parseBlockManifest(raw: unknown, source: BlockSource): BlockDefinition | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const name = obj.name;
  if (typeof name !== 'string' || !NAME_RE.test(name)) return null;
  const kind = obj.kind === 'container' ? 'container' : obj.kind === 'leaf' ? 'leaf' : null;
  if (!kind) return null;

  let trust: BlockTrust = obj.trust === 'sandboxed' ? 'sandboxed' : 'template';
  // Only shipped definitions may run as trusted built-ins; anything discovered from the
  // workspace or the user's home directory can never claim editor privileges.
  if (obj.trust === 'builtin' && source === 'shipped') trust = 'builtin';
  const script = typeof obj.script === 'string' ? obj.script : undefined;
  // Author render code discovered outside the shipped set can only ever run sandboxed —
  // it never inherits editor privileges, whatever the manifest claims.
  if (script && source !== 'shipped') trust = 'sandboxed';

  return {
    name,
    title: typeof obj.title === 'string' && obj.title ? obj.title : name,
    kind,
    icon: typeof obj.icon === 'string' ? obj.icon : undefined,
    group: typeof obj.group === 'string' ? obj.group : undefined,
    keywords: Array.isArray(obj.keywords) ? obj.keywords.filter((k): k is string => typeof k === 'string') : undefined,
    defaultParams:
      obj.defaultParams && typeof obj.defaultParams === 'object'
        ? (obj.defaultParams as Record<string, unknown>)
        : {},
    params: parseParamDefs(obj.params),
    template: typeof obj.template === 'string' ? obj.template : undefined,
    script,
    trust,
    source
  };
}

/**
 * Resolve the three layers into one set, first match winning by name: a workspace block
 * shadows a user block shadows a shipped one (docs/design/DECISIONS.md). Input order within a
 * layer is preserved; the result is sorted by title for stable menu display.
 */
export function resolveBlocks(
  workspace: BlockDefinition[],
  user: BlockDefinition[],
  shipped: BlockDefinition[]
): BlockDefinition[] {
  const byName = new Map<string, BlockDefinition>();
  // Later layers must not overwrite earlier ones, so seed in precedence order.
  for (const def of [...workspace, ...user, ...shipped]) {
    if (!byName.has(def.name)) byName.set(def.name, def);
  }
  return [...byName.values()].sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * The blocks OMD ships. The three-layer discovery treats these as the lowest-precedence
 * layer, so a workspace or user block of the same name shadows them. (The full 18 arrive
 * in P5; this starter set exercises leaf + container + shadowing.)
 */
export const SHIPPED_BLOCKS: BlockDefinition[] = [
  {
    name: 'date',
    title: 'Date',
    kind: 'leaf',
    icon: 'calendar',
    group: 'Inline',
    keywords: ['date', 'day', 'calendar'],
    defaultParams: { value: '' },
    trust: 'builtin',
    source: 'shipped'
  },
  {
    name: 'footnote',
    title: 'Footnote',
    kind: 'leaf',
    icon: 'references',
    group: 'Inline',
    keywords: ['footnote', 'note', 'citation', 'reference'],
    defaultParams: {},
    trust: 'builtin',
    source: 'shipped'
  },
  {
    name: 'toc',
    title: 'Table of contents',
    kind: 'leaf',
    icon: 'list-tree',
    group: 'Inline',
    keywords: ['toc', 'outline', 'contents'],
    defaultParams: {},
    params: [
      { name: 'ordered', label: 'Numbered', type: 'boolean', default: false },
      { name: 'maxLevel', label: 'Max level', type: 'enum', options: ['1', '2', '3', '4', '5', '6'], default: '6' }
    ],
    trust: 'builtin',
    source: 'shipped'
  },
  {
    name: 'collapsible',
    title: 'Collapsible',
    kind: 'container',
    icon: 'chevron-right',
    group: 'Structure',
    keywords: ['collapsible', 'details', 'accordion', 'fold'],
    defaultParams: { summary: 'Details' },
    trust: 'builtin',
    source: 'shipped'
  },
  {
    name: 'chart',
    title: 'Chart',
    kind: 'container',
    icon: 'graph-line',
    group: 'Rich',
    keywords: ['chart', 'graph', 'bar', 'line', 'pie', 'data', 'plot'],
    defaultParams: { type: 'bar', title: 'Chart' },
    params: [
      { name: 'title', label: 'Title', type: 'string' },
      { name: 'type', label: 'Type', type: 'enum', options: ['bar', 'line', 'pie', 'doughnut'], default: 'bar' }
    ],
    trust: 'builtin',
    source: 'shipped'
  },
  {
    name: 'youtube',
    title: 'YouTube',
    kind: 'container',
    icon: 'youtube',
    group: 'Media',
    keywords: ['youtube', 'video', 'embed', 'media'],
    defaultParams: { url: '' },
    params: [
      { name: 'url', label: 'URL', type: 'string' },
      { name: 'title', label: 'Title', type: 'string' },
      { name: 'width', label: 'Width', type: 'string' },
      { name: 'caption', label: 'Caption', type: 'string' }
    ],
    trust: 'builtin',
    source: 'shipped'
  },
  {
    name: 'linkcard',
    title: 'Link card',
    kind: 'container',
    icon: 'link',
    group: 'Media',
    keywords: ['link', 'card', 'bookmark', 'url', 'preview', 'embed', 'opengraph', 'og'],
    defaultParams: { url: '' },
    params: [
      { name: 'url', label: 'URL', type: 'string', required: true },
      { name: 'title', label: 'Title', type: 'string' },
      { name: 'description', label: 'Description', type: 'string' },
      { name: 'image', label: 'Image URL', type: 'string' },
      { name: 'site', label: 'Site', type: 'string' }
    ],
    trust: 'builtin',
    source: 'shipped'
  },
  {
    name: 'gallery',
    title: 'Gallery',
    kind: 'container',
    icon: 'file-media',
    group: 'Media',
    keywords: ['gallery', 'images', 'photos', 'grid', 'media'],
    defaultParams: {},
    params: [
      { name: 'title', label: 'Title', type: 'string' },
      { name: 'columns', label: 'Columns', type: 'enum', options: ['auto', '2', '3', '4'], default: 'auto' }
    ],
    trust: 'builtin',
    source: 'shipped'
  },
  {
    name: 'tabs',
    title: 'Tabs',
    kind: 'container',
    icon: 'layout',
    group: 'Structure',
    keywords: ['tabs', 'tabbed', 'panels', 'sections'],
    defaultParams: {},
    trust: 'builtin',
    source: 'shipped'
  },
  {
    name: 'callout',
    title: 'Callout',
    kind: 'container',
    icon: 'megaphone',
    group: 'Structure',
    keywords: ['callout', 'admonition', 'aside', 'box', 'note', 'smart'],
    defaultParams: { icon: 'info', color: '#4daafc' },
    params: [
      {
        name: 'icon',
        label: 'Icon',
        type: 'enum',
        options: ['info', 'light-bulb', 'megaphone', 'warning', 'error', 'check', 'comment'],
        default: 'info'
      },
      { name: 'color', label: 'Color', type: 'color', default: '#4daafc' }
    ],
    trust: 'builtin',
    source: 'shipped'
  },
  {
    name: 'ai',
    title: 'AI',
    kind: 'container',
    icon: 'sparkle',
    group: 'Rich',
    keywords: ['ai', 'prompt', 'generate', 'llm', 'gpt', 'copilot'],
    // The prompt/scope/model live in params; the generated markdown is cached in the body. Only
    // shipped blocks may run as `builtin` and make the host model call (discovered/sandboxed blocks
    // have no network) — see docs/design/SMART-BLOCKS.md and docs/design/DECISIONS.md.
    // The prompt/scope/model are edited in the block's own Prompt tab, not the hover property panel
    // (the AI block opts out of it), so no `params` are declared here — inserting drops an empty
    // block that opens on its Prompt tab, ready to edit.
    defaultParams: { prompt: '', scope: 'none' },
    trust: 'builtin',
    source: 'shipped'
  },
  {
    name: '2col',
    title: 'Two columns',
    kind: 'container',
    icon: 'split-horizontal',
    group: 'Structure',
    keywords: ['columns', '2col', 'two', 'side by side', 'layout'],
    defaultParams: {},
    trust: 'builtin',
    source: 'shipped'
  },
  {
    name: '3col',
    title: 'Three columns',
    kind: 'container',
    icon: 'editor-layout',
    group: 'Structure',
    keywords: ['columns', '3col', 'three', 'layout'],
    defaultParams: {},
    trust: 'builtin',
    source: 'shipped'
  }
];
