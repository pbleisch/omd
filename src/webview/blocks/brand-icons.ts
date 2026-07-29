import { registerIcon } from '../codicons';

/**
 * Brand-logo icons for blocks whose subject is a specific service (a YouTube block gets the
 * YouTube mark, etc.). Paths are from Simple Icons (simpleicons.org, CC0), rendered **monochrome**
 * via `fill="currentColor"` so they stay theme-aware and sit consistently alongside the codicon
 * chrome. Only the icons OMD actually uses are inlined — the full `simple-icons` package is a 5 MB
 * CommonJS module that can't be tree-shaken, so it stays a devDependency (the source), not a
 * bundled runtime dep.
 *
 * To add or refresh an icon:
 *   node -e "console.log(require('simple-icons').siYoutube.path)"
 */

const svg = (path: string): string =>
  `<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="${path}"/></svg>`;

/** Source: Simple Icons (CC0). */
const BRAND_ICONS: Record<string, string> = {
  youtube:
    'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z'
};

/** Register all brand icons with the codicon factory. Call once at startup, before blocks render. */
export function registerBrandIcons(): void {
  for (const [name, path] of Object.entries(BRAND_ICONS)) registerIcon(name, svg(path));
}
