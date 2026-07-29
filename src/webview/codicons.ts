// @ts-expect-error esbuild dataurl loader turns the font into a data: URI string.
import codiconFont from '@vscode/codicons/dist/codicon.ttf';

/**
 * Codicons for all chrome (docs/design/STYLE.md). The codicon.css references the font by a
 * relative URL a sandboxed webview can't load, so we build the @font-face from the
 * dataurl'd ttf and declare only the glyphs OMD uses. Codicons inherit currentColor,
 * which is what keeps chrome theme-aware.
 */
const GLYPHS: Record<string, string> = {
  'light-bulb': '\\ea61',
  warning: '\\ea6c',
  info: '\\ea74',
  error: '\\ea87',
  megaphone: '\\eb1e',
  edit: '\\ea73',
  copy: '\\ebcc',
  save: '\\eb4b',
  check: '\\eab2',
  trash: '\\ea81',
  refresh: '\\eb37',
  shield: '\\ea79',
  // Toolbar + slash-menu chrome (docs/design/STYLE.md — codicons only).
  bold: '\\eaa3',
  italic: '\\eb0d',
  code: '\\eac4',
  'chrome-minimize': '\\eaba',
  quote: '\\eb33',
  'list-unordered': '\\eb17',
  'list-ordered': '\\eb16',
  'symbol-namespace': '\\ea8b',
  dash: '\\eacc',
  'type-hierarchy': '\\ebb9',
  'symbol-operator': '\\eb64',
  table: '\\ebb7',
  // Shipped smart-block icons.
  calendar: '\\eab0',
  'chevron-right': '\\eab6',
  'chevron-down': '\\eab4',
  'list-tree': '\\eb86',
  'settings-gear': '\\eb51',
  'split-horizontal': '\\eb56',
  'editor-layout': '\\eae3',
  references: '\\eb36',
  layout: '\\ebeb',
  'play-circle': '\\eba6',
  'file-media': '\\eaea',
  graph: '\\eb03',
  'graph-line': '\\ebe2',
  comment: '\\ea6b',
  sparkle: '\\ec10',
  'stop-circle': '\\eba5',
  // Context-menu + table-operation chrome (Phase 1).
  blank: '\\ec03',
  close: '\\ea76',
  'arrow-up': '\\eaa1',
  'arrow-down': '\\ea9a',
  'arrow-left': '\\ea9b',
  'arrow-right': '\\ea9c',
  'arrow-small-left': '\\ea9e',
  'arrow-small-right': '\\ea9f',
  'arrow-both': '\\ea99',
  // Table column-sort UI (plugins/table-controls): neutral affordance + active direction.
  'sort-precedence': '\\eb55',
  'triangle-up': '\\eb71',
  'triangle-down': '\\eb6e',
  // Toolbar-enrichment chrome (Phase 3).
  discard: '\\eae2',
  redo: '\\ebb0',
  link: '\\eb15',
  tasklist: '\\eb67',
  search: '\\ea6d',
  gripper: '\\eb04',
  'zoom-in': '\\eb81',
  'zoom-out': '\\eb82'
};

export const codiconCss = `
@font-face {
  font-family: "codicon";
  src: url(${JSON.stringify(codiconFont)}) format("truetype");
}
.codicon {
  font-family: "codicon";
  font-size: 16px;
  line-height: 1;
  font-style: normal;
  display: inline-block;
  text-align: center;
  text-decoration: none;
  text-rendering: auto;
  -webkit-font-smoothing: antialiased;
  user-select: none;
}
/* Custom (non-font) icons: an inline SVG sized to match a glyph. */
.codicon-custom {
  width: 1em;
  height: 1em;
}
.codicon-custom svg {
  width: 100%;
  height: 100%;
  display: block;
}
${Object.entries(GLYPHS)
  .map(([name, code]) => `.codicon-${name}:before { content: "${code}"; }`)
  .join('\n')}
`;

/**
 * Custom (non-codicon) icons — inline SVG a block's `icon` can resolve to, so a brand logo or a
 * bespoke mark can stand in for a font glyph. Register with `registerIcon`; use `fill="currentColor"`
 * in the SVG to stay theme-aware, or hardcode brand colours when that's the intent.
 */
const CUSTOM_ICONS = new Map<string, string>();

export function registerIcon(name: string, svg: string): void {
  CUSTOM_ICONS.set(name, svg);
}

/** Create an icon element — a registered custom SVG if one exists, otherwise the codicon glyph. */
export function codicon(name: keyof typeof GLYPHS | string): HTMLElement {
  const custom = CUSTOM_ICONS.get(name as string);
  if (custom) {
    const el = document.createElement('span');
    el.className = `codicon codicon-custom codicon-${name}`;
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = custom;
    return el;
  }
  const el = document.createElement('i');
  el.className = `codicon codicon-${name}`;
  el.setAttribute('aria-hidden', 'true');
  return el;
}
