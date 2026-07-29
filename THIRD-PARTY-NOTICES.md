# Third-party notices

OMD bundles the following open-source packages into its shipped code (`dist/extension.js` and
`media/webview.js`). Each remains under its own license; full license texts are available in each
package's repository and in `node_modules/<package>` in a source checkout.

Generated from the esbuild bundle metafiles — this is the set of packages actually compiled into the
shipped artifacts (185 packages). All are permissive (MIT / ISC / BSD / Apache-2.0 / MPL-2.0 /
Unlicense / CC-BY-4.0), compatible with redistribution under this extension's MIT license.

Notes: `khroma` ships an MIT `license` file but omits the `license` field in its `package.json`, so
it is reported below as UNKNOWN — it is MIT. `@vscode/codicons` is CC-BY-4.0 (icon artwork).
`dompurify` is dual-licensed MPL-2.0 OR Apache-2.0.

## By license

- **(MPL-2.0 OR Apache-2.0)** (1): dompurify
- **Apache-2.0** (2): mathjax-full, mhchemparser
- **BSD-3-Clause** (2): d3-ease, d3-sankey
- **CC-BY-4.0** (1): @vscode/codicons
- **ISC** (34): @ungap/structured-clone, d3, d3-array, d3-axis, d3-brush, d3-chord, d3-color, d3-contour, d3-delaunay, d3-dispatch, d3-drag, d3-dsv, d3-fetch, d3-force, d3-format, d3-geo, d3-hierarchy, d3-interpolate, d3-path, d3-polygon, d3-quadtree, d3-random, d3-scale, d3-scale-chromatic, d3-selection, d3-shape, d3-time, d3-time-format, d3-timer, d3-transition, d3-zoom, delaunator, internmap, yaml
- **MIT** (143): @braintree/sanitize-url, @iconify/utils, @kurkle/color, @mermaid-js/parser, @milkdown/core, @milkdown/ctx, @milkdown/exception, @milkdown/plugin-listener, @milkdown/preset-commonmark, @milkdown/preset-gfm, @milkdown/prose, @milkdown/transformer, @milkdown/utils, @shikijs/core, @shikijs/engine-javascript, @shikijs/langs, @shikijs/primitive, @shikijs/themes, @shikijs/types, @shikijs/vscode-textmate, @upsetjs/venn.js, bail, ccount, character-entities, character-entities-html4, character-entities-legacy, chart.js, comma-separated-tokens, cose-base, cytoscape, cytoscape-cose-bilkent, cytoscape-fcose, dagre-d3-es, dayjs, decode-named-character-reference, devlop, es-toolkit, escape-string-regexp, extend, fault, format, hast-util-sanitize, hast-util-to-html, hast-util-whitespace, html-void-elements, is-plain-obj, js-yaml, katex, layout-base, lodash-es, longest-streak, markdown-table, marked, mdast-util-definitions, mdast-util-find-and-replace, mdast-util-from-markdown, mdast-util-frontmatter, mdast-util-gfm, mdast-util-gfm-autolink-literal, mdast-util-gfm-footnote, mdast-util-gfm-strikethrough, mdast-util-gfm-table, mdast-util-gfm-task-list-item, mdast-util-math, mdast-util-phrasing, mdast-util-to-hast, mdast-util-to-markdown, mdast-util-to-string, mermaid, micromark, micromark-core-commonmark, micromark-extension-frontmatter, micromark-extension-gfm, micromark-extension-gfm-autolink-literal, micromark-extension-gfm-footnote, micromark-extension-gfm-strikethrough, micromark-extension-gfm-table, micromark-extension-gfm-tagfilter, micromark-extension-gfm-task-list-item, micromark-extension-math, micromark-factory-destination, micromark-factory-label, micromark-factory-space, micromark-factory-title, micromark-factory-whitespace, micromark-util-character, micromark-util-chunked, micromark-util-classify-character, micromark-util-combine-extensions, micromark-util-decode-numeric-character-reference, micromark-util-decode-string, micromark-util-encode, micromark-util-html-tag-name, micromark-util-normalize-identifier, micromark-util-resolve-all, micromark-util-sanitize-uri, micromark-util-subtokenize, nanoid, oniguruma-parser, oniguruma-to-es, orderedmap, property-information, prosemirror-commands, prosemirror-history, prosemirror-inputrules, prosemirror-keymap, prosemirror-model, prosemirror-safari-ime-span, prosemirror-schema-list, prosemirror-state, prosemirror-tables, prosemirror-transform, prosemirror-view, regex, regex-recursion, regex-utilities, remark-frontmatter, remark-gfm, remark-html, remark-inline-links, remark-math, remark-parse, remark-stringify, rope-sequence, roughjs, shiki, space-separated-tokens, stringify-entities, stylis, trim-lines, trough, ts-dedent, unified, unist-util-is, unist-util-position, unist-util-stringify-position, unist-util-visit, unist-util-visit-parents, uuid, vfile, vfile-message, w3c-keyname, zwitch
- **UNKNOWN** (1): khroma
- **Unlicense** (1): robust-predicates

## All packages

| Package | Version | License |
|---|---|---|
| `@braintree/sanitize-url` | 7.1.2 | MIT |
| `@iconify/utils` | 3.1.4 | MIT |
| `@kurkle/color` | 0.3.4 | MIT |
| `@mermaid-js/parser` | 1.2.0 | MIT |
| `@milkdown/core` | 7.21.3 | MIT |
| `@milkdown/ctx` | 7.21.3 | MIT |
| `@milkdown/exception` | 7.21.3 | MIT |
| `@milkdown/plugin-listener` | 7.21.3 | MIT |
| `@milkdown/preset-commonmark` | 7.21.3 | MIT |
| `@milkdown/preset-gfm` | 7.21.3 | MIT |
| `@milkdown/prose` | 7.21.3 | MIT |
| `@milkdown/transformer` | 7.21.3 | MIT |
| `@milkdown/utils` | 7.21.3 | MIT |
| `@shikijs/core` | 4.3.1 | MIT |
| `@shikijs/engine-javascript` | 4.3.1 | MIT |
| `@shikijs/langs` | 4.3.1 | MIT |
| `@shikijs/primitive` | 4.3.1 | MIT |
| `@shikijs/themes` | 4.3.1 | MIT |
| `@shikijs/types` | 4.3.1 | MIT |
| `@shikijs/vscode-textmate` | 10.0.2 | MIT |
| `@ungap/structured-clone` | 1.3.3 | ISC |
| `@upsetjs/venn.js` | 2.0.0 | MIT |
| `@vscode/codicons` | 0.0.44 | CC-BY-4.0 |
| `bail` | 2.0.2 | MIT |
| `ccount` | 2.0.1 | MIT |
| `character-entities` | 2.0.2 | MIT |
| `character-entities-html4` | 2.1.0 | MIT |
| `character-entities-legacy` | 3.0.0 | MIT |
| `chart.js` | 4.5.1 | MIT |
| `comma-separated-tokens` | 2.0.3 | MIT |
| `cose-base` | 1.0.3 | MIT |
| `cytoscape` | 3.34.0 | MIT |
| `cytoscape-cose-bilkent` | 4.1.0 | MIT |
| `cytoscape-fcose` | 2.2.0 | MIT |
| `d3` | 7.9.0 | ISC |
| `d3-array` | 3.2.4 | ISC |
| `d3-axis` | 3.0.0 | ISC |
| `d3-brush` | 3.0.0 | ISC |
| `d3-chord` | 3.0.1 | ISC |
| `d3-color` | 3.1.0 | ISC |
| `d3-contour` | 4.0.2 | ISC |
| `d3-delaunay` | 6.0.4 | ISC |
| `d3-dispatch` | 3.0.1 | ISC |
| `d3-drag` | 3.0.0 | ISC |
| `d3-dsv` | 3.0.1 | ISC |
| `d3-ease` | 3.0.1 | BSD-3-Clause |
| `d3-fetch` | 3.0.1 | ISC |
| `d3-force` | 3.0.0 | ISC |
| `d3-format` | 3.1.2 | ISC |
| `d3-geo` | 3.1.1 | ISC |
| `d3-hierarchy` | 3.1.2 | ISC |
| `d3-interpolate` | 3.0.1 | ISC |
| `d3-path` | 3.1.0 | ISC |
| `d3-polygon` | 3.0.1 | ISC |
| `d3-quadtree` | 3.0.1 | ISC |
| `d3-random` | 3.0.1 | ISC |
| `d3-sankey` | 0.12.3 | BSD-3-Clause |
| `d3-scale` | 4.0.2 | ISC |
| `d3-scale-chromatic` | 3.1.0 | ISC |
| `d3-selection` | 3.0.0 | ISC |
| `d3-shape` | 3.2.0 | ISC |
| `d3-time` | 3.1.0 | ISC |
| `d3-time-format` | 4.1.0 | ISC |
| `d3-timer` | 3.0.1 | ISC |
| `d3-transition` | 3.0.1 | ISC |
| `d3-zoom` | 3.0.0 | ISC |
| `dagre-d3-es` | 7.0.14 | MIT |
| `dayjs` | 1.11.21 | MIT |
| `decode-named-character-reference` | 1.3.0 | MIT |
| `delaunator` | 5.1.0 | ISC |
| `devlop` | 1.1.0 | MIT |
| `dompurify` | 3.4.12 | (MPL-2.0 OR Apache-2.0) |
| `es-toolkit` | 1.49.0 | MIT |
| `escape-string-regexp` | 5.0.0 | MIT |
| `extend` | 3.0.2 | MIT |
| `fault` | 2.0.1 | MIT |
| `format` | 0.2.2 | MIT |
| `hast-util-sanitize` | 5.0.2 | MIT |
| `hast-util-to-html` | 9.0.5 | MIT |
| `hast-util-whitespace` | 3.0.0 | MIT |
| `html-void-elements` | 3.0.0 | MIT |
| `internmap` | 2.0.3 | ISC |
| `is-plain-obj` | 4.1.0 | MIT |
| `js-yaml` | 4.3.0 | MIT |
| `katex` | 0.16.47 | MIT |
| `khroma` | 2.1.0 | UNKNOWN |
| `layout-base` | 1.0.2 | MIT |
| `lodash-es` | 4.18.1 | MIT |
| `longest-streak` | 3.1.0 | MIT |
| `markdown-table` | 3.0.4 | MIT |
| `marked` | 16.4.2 | MIT |
| `mathjax-full` | 3.2.2 | Apache-2.0 |
| `mdast-util-definitions` | 6.0.0 | MIT |
| `mdast-util-find-and-replace` | 3.0.2 | MIT |
| `mdast-util-from-markdown` | 2.0.3 | MIT |
| `mdast-util-frontmatter` | 2.0.1 | MIT |
| `mdast-util-gfm` | 3.1.0 | MIT |
| `mdast-util-gfm-autolink-literal` | 2.0.1 | MIT |
| `mdast-util-gfm-footnote` | 2.1.0 | MIT |
| `mdast-util-gfm-strikethrough` | 2.0.0 | MIT |
| `mdast-util-gfm-table` | 2.0.0 | MIT |
| `mdast-util-gfm-task-list-item` | 2.0.0 | MIT |
| `mdast-util-math` | 3.0.0 | MIT |
| `mdast-util-phrasing` | 4.1.0 | MIT |
| `mdast-util-to-hast` | 13.2.1 | MIT |
| `mdast-util-to-markdown` | 2.1.2 | MIT |
| `mdast-util-to-string` | 4.0.0 | MIT |
| `mermaid` | 11.16.0 | MIT |
| `mhchemparser` | 4.2.1 | Apache-2.0 |
| `micromark` | 4.0.2 | MIT |
| `micromark-core-commonmark` | 2.0.3 | MIT |
| `micromark-extension-frontmatter` | 2.0.0 | MIT |
| `micromark-extension-gfm` | 3.0.0 | MIT |
| `micromark-extension-gfm-autolink-literal` | 2.1.0 | MIT |
| `micromark-extension-gfm-footnote` | 2.1.0 | MIT |
| `micromark-extension-gfm-strikethrough` | 2.1.0 | MIT |
| `micromark-extension-gfm-table` | 2.1.1 | MIT |
| `micromark-extension-gfm-tagfilter` | 2.0.0 | MIT |
| `micromark-extension-gfm-task-list-item` | 2.1.0 | MIT |
| `micromark-extension-math` | 3.1.0 | MIT |
| `micromark-factory-destination` | 2.0.1 | MIT |
| `micromark-factory-label` | 2.0.1 | MIT |
| `micromark-factory-space` | 2.0.1 | MIT |
| `micromark-factory-title` | 2.0.1 | MIT |
| `micromark-factory-whitespace` | 2.0.1 | MIT |
| `micromark-util-character` | 2.1.1 | MIT |
| `micromark-util-chunked` | 2.0.1 | MIT |
| `micromark-util-classify-character` | 2.0.1 | MIT |
| `micromark-util-combine-extensions` | 2.0.1 | MIT |
| `micromark-util-decode-numeric-character-reference` | 2.0.2 | MIT |
| `micromark-util-decode-string` | 2.0.1 | MIT |
| `micromark-util-encode` | 2.0.1 | MIT |
| `micromark-util-html-tag-name` | 2.0.1 | MIT |
| `micromark-util-normalize-identifier` | 2.0.1 | MIT |
| `micromark-util-resolve-all` | 2.0.1 | MIT |
| `micromark-util-sanitize-uri` | 2.0.1 | MIT |
| `micromark-util-subtokenize` | 2.1.0 | MIT |
| `nanoid` | 5.1.16 | MIT |
| `oniguruma-parser` | 0.12.2 | MIT |
| `oniguruma-to-es` | 4.3.6 | MIT |
| `orderedmap` | 2.1.1 | MIT |
| `property-information` | 7.2.0 | MIT |
| `prosemirror-commands` | 1.7.1 | MIT |
| `prosemirror-history` | 1.5.0 | MIT |
| `prosemirror-inputrules` | 1.5.1 | MIT |
| `prosemirror-keymap` | 1.2.3 | MIT |
| `prosemirror-model` | 1.25.11 | MIT |
| `prosemirror-safari-ime-span` | 1.0.2 | MIT |
| `prosemirror-schema-list` | 1.5.1 | MIT |
| `prosemirror-state` | 1.4.4 | MIT |
| `prosemirror-tables` | 1.8.5 | MIT |
| `prosemirror-transform` | 1.12.0 | MIT |
| `prosemirror-view` | 1.42.1 | MIT |
| `regex` | 6.1.0 | MIT |
| `regex-recursion` | 6.0.2 | MIT |
| `regex-utilities` | 2.3.0 | MIT |
| `remark-frontmatter` | 5.0.0 | MIT |
| `remark-gfm` | 4.0.1 | MIT |
| `remark-html` | 16.0.1 | MIT |
| `remark-inline-links` | 7.0.0 | MIT |
| `remark-math` | 6.0.0 | MIT |
| `remark-parse` | 11.0.0 | MIT |
| `remark-stringify` | 11.0.0 | MIT |
| `robust-predicates` | 3.0.3 | Unlicense |
| `rope-sequence` | 1.3.4 | MIT |
| `roughjs` | 4.6.6 | MIT |
| `shiki` | 4.3.1 | MIT |
| `space-separated-tokens` | 2.0.2 | MIT |
| `stringify-entities` | 4.0.4 | MIT |
| `stylis` | 4.4.0 | MIT |
| `trim-lines` | 3.0.1 | MIT |
| `trough` | 2.2.0 | MIT |
| `ts-dedent` | 2.3.0 | MIT |
| `unified` | 11.0.5 | MIT |
| `unist-util-is` | 6.0.1 | MIT |
| `unist-util-position` | 5.0.0 | MIT |
| `unist-util-stringify-position` | 4.0.0 | MIT |
| `unist-util-visit` | 5.1.0 | MIT |
| `unist-util-visit-parents` | 6.0.2 | MIT |
| `uuid` | 14.0.1 | MIT |
| `vfile` | 6.0.3 | MIT |
| `vfile-message` | 4.0.3 | MIT |
| `w3c-keyname` | 2.2.8 | MIT |
| `yaml` | 2.9.0 | ISC |
| `zwitch` | 2.0.4 | MIT |

## Test fixtures (not shipped)

These are vendored for the test suite only — they are **not** compiled into the shipped artifacts.

| Fixture | Source | License |
| --- | --- | --- |
| `test/fixtures/gfm-spec/spec.txt` | GitHub Flavored Markdown spec examples, from [`github/cmark-gfm`](https://github.com/github/cmark-gfm) `test/spec.txt` (GFM 0.29) | Spec text CC-BY-SA 4.0 (© John MacFarlane & the CommonMark community); cmark-gfm BSD-2-Clause (© GitHub, Inc.) |
