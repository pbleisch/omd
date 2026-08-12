import { $markSchema, $nodeSchema, $remark } from '@milkdown/utils';
import { defaultHandlers, type Handle } from 'mdast-util-to-markdown';
import type { Definition, Parents } from 'mdast';

/**
 * Reference-style links as first-class document nodes (#33).
 *
 * `@milkdown/preset-commonmark` bundles `remark-inline-links` as a **parse** plugin, so a
 * document's `definition` nodes were deleted and every `linkReference` was rewritten to an
 * inline `link` before the editor ever saw them: `[ref]: url` + `[ref]` came back as
 * `[ref](url)`, with the definitions block gone and the URL duplicated at each use site. That
 * is silent data loss on *load*, and nothing at serialize time can undo it — by then the
 * `definition` node no longer exists. `editor.ts` drops that one preset plugin; this file gives
 * the editor the schema to hold what now survives the parse.
 *
 * Three shapes, mirroring mdast:
 *   - `omdDefinition` — a block node for `[label]: url "title"`. The exact bytes are kept in a
 *     `raw` attr sliced from the source, so an unusual but legal spelling (`<url>`, a
 *     `'`-quoted title, extra spaces) saves back as written rather than in remark's canonical
 *     form. Same raw-preservation idea as the entity, autolink and `<br>` plugins.
 *   - `omdLinkReference` — a mark for `[ref]`, `[ref][]` and `[text][ref]`. A mark, like
 *     `link`, so the label stays ordinary editable text.
 *   - `omdImageReference` — an inline atom for `![alt][ref]` and its shorthands.
 *
 * A reference whose definition is missing never reaches here: CommonMark only produces a
 * `linkReference` when a matching definition exists, so `[nodef]` stays literal text. The
 * escape that keeps it literal on save is `relax-escapes.ts`'s `documentHasDefinitions` guard.
 *
 * Rendering resolves each reference against the document's definitions **at parse time** and
 * stores the target on the node, so a reference renders as a real live link and a reference
 * image as a real image. Only `identifier`/`label`/`referenceType` are serialized, so the
 * resolved target never leaks into the file.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MdNode = { type: string; [k: string]: any };

/** mdast's label normalization: case-folded and whitespace-collapsed (CommonMark "matches"). */
function normalizeLabel(label: string): string {
  return label.trim().replace(/[\t\n\r ]+/g, ' ').toLowerCase();
}

/** Every `definition` in the tree, keyed by identifier — the first wins, as CommonMark says. */
function collectDefinitions(tree: MdNode): Map<string, { url: string; title: string | null }> {
  const found = new Map<string, { url: string; title: string | null }>();
  const walk = (node: MdNode): void => {
    if (node.type === 'definition') {
      const id = normalizeLabel(String(node.identifier ?? node.label ?? ''));
      if (!found.has(id)) found.set(id, { url: String(node.url ?? ''), title: node.title ?? null });
    }
    if (Array.isArray(node.children)) for (const child of node.children) walk(child);
  };
  walk(tree);
  return found;
}

/**
 * Stamp definitions with their source bytes and references with their resolved target.
 *
 * The raw slice is only taken for a single-line definition. A definition wrapped across lines,
 * or inside a blockquote or list item, carries its container's line prefixes in the source, and
 * re-emitting those verbatim would double them; those fall back to remark's own spelling, which
 * is correct markdown even when it is not the writer's bytes.
 */
export const remarkReferenceLinks = $remark(
  'omd-reference-links',
  () => () => (tree: MdNode, file: unknown) => {
    const source = String(file);
    const definitions = collectDefinitions(tree);
    const walk = (node: MdNode): void => {
      if (node.type === 'definition' && node.position) {
        const raw = source.slice(node.position.start.offset, node.position.end.offset);
        if (!raw.includes('\n')) node.raw = raw;
      }
      if (node.type === 'linkReference' || node.type === 'imageReference') {
        const target = definitions.get(normalizeLabel(String(node.identifier ?? node.label ?? '')));
        if (target) {
          node.resolvedUrl = target.url;
          node.resolvedTitle = target.title;
        }
      }
      if (Array.isArray(node.children)) for (const child of node.children) walk(child);
    };
    walk(tree);
  }
);

/** The attrs every reference node/mark carries, read off an mdast `*Reference` node. */
function referenceAttrs(node: MdNode): Record<string, unknown> {
  return {
    identifier: String(node.identifier ?? ''),
    label: String(node.label ?? node.identifier ?? ''),
    referenceType: String(node.referenceType ?? 'shortcut'),
    resolvedUrl: typeof node.resolvedUrl === 'string' ? node.resolvedUrl : '',
    resolvedTitle: typeof node.resolvedTitle === 'string' ? node.resolvedTitle : ''
  };
}

/** The mdast props a reference serializes from — the resolved target is deliberately absent. */
function referenceProps(attrs: Record<string, unknown>): Record<string, unknown> {
  return {
    identifier: attrs.identifier as string,
    label: attrs.label as string,
    referenceType: attrs.referenceType as string
  };
}

/** Read the reference attrs back off a DOM element, for paste and undo. */
function referenceAttrsFromDom(dom: HTMLElement): Record<string, unknown> {
  return {
    identifier: dom.dataset.identifier ?? '',
    label: dom.dataset.label ?? '',
    referenceType: dom.dataset.referenceType ?? 'shortcut',
    resolvedUrl: dom.dataset.resolvedUrl ?? '',
    resolvedTitle: dom.dataset.resolvedTitle ?? ''
  };
}

/** The `data-*` attributes `referenceAttrsFromDom` reads. */
function referenceDataset(attrs: Record<string, unknown>): Record<string, string> {
  return {
    'data-identifier': attrs.identifier as string,
    'data-label': attrs.label as string,
    'data-reference-type': attrs.referenceType as string,
    'data-resolved-url': attrs.resolvedUrl as string,
    'data-resolved-title': attrs.resolvedTitle as string
  };
}

/**
 * `[label]: url "title"` as its own block. Registered *after* the commonmark preset, so
 * `paragraph` stays the schema's default block type (a new `block`-group node registered ahead
 * of it would silently become what an empty document and every `setBlockType` fall back to).
 */
export const definitionSchema = $nodeSchema('omdDefinition', () => ({
  group: 'block',
  atom: true,
  selectable: true,
  defining: true,
  attrs: {
    identifier: { default: '' },
    label: { default: '' },
    url: { default: '' },
    title: { default: '' },
    raw: { default: '' }
  },
  parseDOM: [
    {
      tag: 'div[data-type="omd-definition"]',
      getAttrs: (dom) => {
        const el = dom as HTMLElement;
        return {
          identifier: el.dataset.identifier ?? '',
          label: el.dataset.label ?? '',
          url: el.dataset.url ?? '',
          title: el.dataset.title ?? '',
          raw: el.dataset.raw ?? ''
        };
      }
    }
  ],
  toDOM: (node) => {
    const { label, url, title } = node.attrs as Record<string, string>;
    return [
      'div',
      {
        'data-type': 'omd-definition',
        'data-identifier': node.attrs.identifier as string,
        'data-label': label,
        'data-url': url,
        'data-title': title,
        'data-raw': node.attrs.raw as string,
        class: 'omd-definition'
      },
      ['span', { class: 'omd-definition-label' }, `[${label}]:`],
      ['a', { class: 'omd-definition-url', href: url }, url],
      ...(title ? [['span', { class: 'omd-definition-title' }, title] as const] : [])
    ];
  },
  parseMarkdown: {
    match: ({ type }) => type === 'definition',
    runner: (state, node, type) => {
      state.addNode(type, {
        identifier: String(node.identifier ?? ''),
        label: String(node.label ?? node.identifier ?? ''),
        url: String(node.url ?? ''),
        title: typeof node.title === 'string' ? node.title : '',
        raw: typeof node.raw === 'string' ? node.raw : ''
      });
    }
  },
  toMarkdown: {
    match: (node) => node.type.name === 'omdDefinition',
    runner: (state, node) => {
      const attrs = node.attrs as Record<string, string>;
      state.addNode('definition', undefined, undefined, {
        identifier: attrs.identifier,
        label: attrs.label,
        url: attrs.url,
        title: attrs.title || undefined,
        // Read back by `definitionHandler`; remark ignores unknown mdast fields.
        raw: attrs.raw || undefined
      });
    }
  }
}));

/**
 * `[ref]`, `[ref][]`, `[text][ref]` — a mark, so the label is ordinary editable text and the
 * reference survives whatever formatting the writer puts inside it.
 */
export const linkReferenceSchema = $markSchema('omdLinkReference', () => ({
  inclusive: false,
  attrs: {
    identifier: { default: '' },
    label: { default: '' },
    referenceType: { default: 'shortcut' },
    resolvedUrl: { default: '' },
    resolvedTitle: { default: '' }
  },
  parseDOM: [
    {
      tag: 'a[data-omd-link-reference]',
      getAttrs: (dom) => referenceAttrsFromDom(dom as HTMLElement)
    }
  ],
  toDOM: (mark) => {
    const attrs = mark.attrs as Record<string, string>;
    return [
      'a',
      {
        ...referenceDataset(attrs),
        'data-omd-link-reference': 'true',
        class: 'omd-link-reference',
        href: attrs.resolvedUrl,
        title: attrs.resolvedTitle || `[${attrs.label}]`
      },
      0
    ];
  },
  parseMarkdown: {
    match: (node) => node.type === 'linkReference',
    runner: (state, node, markType) => {
      state.openMark(markType, referenceAttrs(node as MdNode));
      state.next(node.children);
      state.closeMark(markType);
    }
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'omdLinkReference',
    runner: (state, mark) => {
      state.withMark(mark, 'linkReference', undefined, referenceProps(mark.attrs));
    }
  }
}));

/** `![alt][ref]` and its shorthands — an inline atom, like the ordinary image node. */
export const imageReferenceSchema = $nodeSchema('omdImageReference', () => ({
  group: 'inline',
  inline: true,
  atom: true,
  attrs: {
    identifier: { default: '' },
    label: { default: '' },
    referenceType: { default: 'shortcut' },
    alt: { default: '' },
    resolvedUrl: { default: '' },
    resolvedTitle: { default: '' }
  },
  parseDOM: [
    {
      tag: 'img[data-omd-image-reference]',
      getAttrs: (dom) => ({
        ...referenceAttrsFromDom(dom as HTMLElement),
        alt: (dom as HTMLElement).getAttribute('alt') ?? ''
      })
    }
  ],
  toDOM: (node) => {
    const attrs = node.attrs as Record<string, string>;
    return [
      'img',
      {
        ...referenceDataset(attrs),
        'data-omd-image-reference': 'true',
        class: 'omd-image-reference',
        src: attrs.resolvedUrl,
        alt: attrs.alt,
        title: attrs.resolvedTitle || `[${attrs.label}]`
      }
    ];
  },
  parseMarkdown: {
    match: ({ type }) => type === 'imageReference',
    runner: (state, node, type) => {
      state.addNode(type, {
        ...referenceAttrs(node as MdNode),
        alt: String(node.alt ?? '')
      });
    }
  },
  toMarkdown: {
    match: (node) => node.type.name === 'omdImageReference',
    runner: (state, node) => {
      const attrs = node.attrs as Record<string, string>;
      state.addNode('imageReference', undefined, undefined, {
        ...referenceProps(attrs),
        alt: attrs.alt
      });
    }
  }
}));

/**
 * A definition saves back as the bytes it was written with (#33).
 *
 * remark's own handler re-spells a definition in its canonical form: `<url>` loses its pointy
 * brackets, a `'`- or `(`-delimited title becomes `"`-quoted, and any extra spacing collapses.
 * Every one of those is a diff in a file the writer only opened. `remarkReferenceLinks` carries
 * the source slice through to here on `raw`; when it is absent — a multi-line definition, or one
 * the user inserted rather than loaded — remark's spelling is the right answer.
 *
 * Kept as an mdast `definition` node rather than raw text so `tightDefinitions` still applies:
 * adjacent definitions must not gain a blank line between them.
 */
export const definitionHandler: Handle = (
  node: Definition & { raw?: string },
  parent: Parents | undefined,
  state,
  info
) => {
  if (typeof node.raw === 'string' && node.raw.length > 0) return node.raw;
  return defaultHandlers.definition(node, parent, state, info);
};
