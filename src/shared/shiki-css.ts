/**
 * CSS that pairs with the Shiki output (`defaultColor: false`): apply the light theme's inline
 * vars by default and the dark theme's under a dark color scheme. Injected by each surface's shell.
 *
 * Its own module so a shell can style highlighted code without importing the renderer that
 * produces it — `shared/github-render.ts` pulls in Shiki's grammars and the whole remark stack,
 * which the export and preview load only when they actually render (docs/operations/PERFORMANCE.md).
 */
export const SHIKI_CSS = `
.shiki, .shiki span { color: var(--shiki-light); background-color: var(--shiki-light-bg); }
@media (prefers-color-scheme: dark) {
  .shiki, .shiki span { color: var(--shiki-dark) !important; background-color: var(--shiki-dark-bg) !important; }
}
.shiki { padding: 16px; overflow: auto; border-radius: 6px; }
.omd-frontmatter { margin-bottom: 16px; }
`;
