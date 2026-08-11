import { describe, it, expect } from 'vitest';
import type { Node as ProseNode } from 'prosemirror-model';
import { roundTrip, roundTripDoc, mountEditor } from './helpers/editor';
import { normalizeMarkdown } from '../src/shared/roundtrip';

/**
 * Reference-style links survive a load (#33).
 *
 * `@milkdown/preset-commonmark` bundles `remark-inline-links` as a **parse** plugin, so every
 * `definition` was deleted and every `linkReference` rewritten to an inline link before the
 * document reached the editor: `[ref]: url` + `[ref]` came back as `[ref](url)`. That is data
 * loss at load time, in a file nobody edited, and no serializer change could undo it — the
 * `definition` node was already gone. Every byte case below failed before the fix.
 *
 * The document-model cases matter as much as the bytes: bytes that come back right because the
 * comparison went blind would pass the first half of gate 1 and still destroy the file.
 */

/** Both halves of hard gate 1 for one document — the same pair `roundtrip.test.ts` asserts. */
async function expectRoundTrips(input: string): Promise<void> {
  const first = await roundTripDoc(input);
  expect(normalizeMarkdown(first.output)).toBe(normalizeMarkdown(input));
  const second = await roundTripDoc(first.output);
  expect(second.doc.toJSON()).toEqual(first.doc.toJSON());
}

/** Every node in the document, flattened — for asserting what the editor is actually holding. */
function nodeNames(doc: ProseNode): string[] {
  const names: string[] = [];
  doc.descendants((node) => {
    names.push(node.type.name);
    return true;
  });
  return names;
}

/** Every mark name in the document. */
function markNames(doc: ProseNode): string[] {
  const names: string[] = [];
  doc.descendants((node) => {
    for (const mark of node.marks) names.push(mark.type.name);
    return true;
  });
  return names;
}

describe('reference-style links round-trip (#33)', () => {
  const cases: Record<string, string> = {
    'shortcut [ref]': '[ref]: https://example.com\n\n[ref]\n',
    'full [text][ref]': '[ref]: https://example.com\n\n[text][ref]\n',
    'collapsed [ref][]': '[ref]: https://example.com\n\n[ref][]\n',
    'a definition with a title': '[ref]: https://example.com "The title"\n\n[ref]\n',
    'reference image, shortcut': '[logo]: https://example.com/a.png\n\n![logo]\n',
    'reference image, full': '[logo]: https://example.com/a.png\n\n![The logo][logo]\n',
    'reference image, collapsed': '[logo]: https://example.com/a.png\n\n![logo][]\n',
    'one definition used from several places':
      '[a]: https://a.example\n[b]: https://b.example\n\nSee [a], then [b], then [a] again.\n',
    'the definition after the prose that uses it':
      'See [ref] here.\n\n[ref]: https://example.com\n',
    'a label whose case differs from the reference':
      '[Ref Label]: https://example.com\n\nUse [ref label] and [Other][REF LABEL].\n',
    'a reference next to an inline link':
      '[ref]: https://example.com\n\n[ref] and [inline](https://other.example).\n'
  };

  for (const [name, input] of Object.entries(cases)) {
    it(`${name} comes back byte-identical and re-parses the same`, async () => {
      await expectRoundTrips(input);
    });
  }

  it('keeps a definition spelled the way it was written', async () => {
    // remark's own definition handler drops the pointy brackets, re-quotes the title with `"`
    // and collapses spacing. All three are diffs in a file the writer only opened.
    const input =
      "[angle]: <https://example.com/a b>\n" +
      "[apos]: https://example.com 'apostrophe title'\n" +
      "[paren]: https://example.com (paren title)\n" +
      "[spaced]:   https://example.com\n" +
      '\n[angle] [apos] [paren] [spaced]\n';
    expect(await roundTrip(input)).toBe(input);
  });

  it('keeps adjacent definitions adjacent (no blank line grows between them)', async () => {
    const input = '[a]: https://a.example\n[b]: https://b.example\n[c]: https://c.example\n\n[a] [b] [c]\n';
    expect(await roundTrip(input)).toBe(input);
  });

  it('a reference with no definition stays literal text, not a broken link', async () => {
    // CommonMark only makes a `linkReference` when a matching definition exists, so this is
    // prose — and it must still be prose after a save, with no dangling link to nowhere.
    await expectRoundTrips('A [nodef] reference.\n');
    for (const input of ['A [nodef] reference.\n', 'A [nodef][missing] one.\n', 'An ![img] alt.\n']) {
      const { doc } = await roundTripDoc(input);
      expect(markNames(doc), input).not.toContain('omdLinkReference');
      expect(markNames(doc), input).not.toContain('link');
      expect(nodeNames(doc), input).not.toContain('omdDefinition');
      expect(nodeNames(doc), input).not.toContain('omdImageReference');
    }
    // `[a][b]` keeps the escapes remark writes for a `][` that *might* have been a reference
    // (`relax-escapes.ts` only relaxes a bracket when no `]` in the container can close one).
    // That is unchanged by this fix; what matters here is that it stays text either way.
    expect(await roundTrip('A [nodef][missing] one.\n')).toBe('A \\[nodef]\\[missing] one.\n');
  });

  it('is stable across repeated generations', async () => {
    // The definition keeps its source bytes by re-slicing the source. A slice that reintroduces
    // something the parser already consumed is stable for one trip and then grows forever, which
    // a single assertion misses (AGENTS.md, hard gate 1).
    const input =
      '[ref]: <https://example.com/a b> \'a "quoted" title\'\n\n[ref], [text][ref] and ![ref].\n';
    let text = input;
    for (let generation = 0; generation < 5; generation += 1) {
      text = await roundTrip(text);
      expect(text, `generation ${generation + 1}`).toBe(input);
    }
  });
});

describe('reference-style links in the document model (#33)', () => {
  it('holds the definition as a definition and the reference as a reference', async () => {
    const { doc } = await roundTripDoc('[ref]: https://example.com "T"\n\n[ref] and [text][ref]\n');

    const definitions: ProseNode[] = [];
    doc.descendants((node) => {
      if (node.type.name === 'omdDefinition') definitions.push(node);
      return true;
    });
    expect(definitions).toHaveLength(1);
    expect(definitions[0].attrs).toMatchObject({
      identifier: 'ref',
      label: 'ref',
      url: 'https://example.com',
      title: 'T'
    });

    // The references are reference marks, not the inline `link` mark the parse plugin produced.
    expect(markNames(doc).filter((n) => n === 'omdLinkReference')).toHaveLength(2);
    expect(markNames(doc)).not.toContain('link');
  });

  it('holds a reference image as a reference, not an inline image', async () => {
    const { doc } = await roundTripDoc('[logo]: https://example.com/a.png\n\n![alt][logo]\n');
    expect(nodeNames(doc)).toContain('omdImageReference');
    expect(nodeNames(doc)).not.toContain('image');
  });

  it('does not duplicate the URL at each use site', async () => {
    const md = '[ref]: https://example.com\n\n[ref], [ref], [ref].\n';
    const out = await roundTrip(md);
    expect(out.match(/https:\/\/example\.com/g)).toHaveLength(1);
  });

  it('leaves paragraph as the schema default block type', async () => {
    // Registering a node in the `block` group ahead of the preset silently changes what an empty
    // document and every `setBlockType` fall back to — the trap the #11 prototype hit.
    const { handle } = await mountEditor('text\n');
    const schema = handle.getView().state.schema;
    expect(schema.topNodeType.contentMatch.defaultType?.name).toBe('paragraph');
    expect(schema.nodes.omdDefinition).toBeTruthy();
    expect(schema.nodes.omdImageReference).toBeTruthy();
    expect(schema.marks.omdLinkReference).toBeTruthy();
  });
});

describe('reference-style links render live (#33)', () => {
  it('renders a reference as a link to its definition and an image reference as an image', async () => {
    const { root } = await mountEditor(
      '[ref]: https://example.com "The title"\n[logo]: https://example.com/a.png\n\n[ref]\n\n![logo]\n'
    );
    const anchor = root.querySelector<HTMLAnchorElement>('a.omd-link-reference');
    expect(anchor?.getAttribute('href')).toBe('https://example.com');
    expect(anchor?.getAttribute('title')).toBe('The title');

    const img = root.querySelector<HTMLImageElement>('img.omd-image-reference');
    expect(img?.getAttribute('src')).toBe('https://example.com/a.png');

    // The definition itself is shown as machinery, with its URL reachable.
    const definition = root.querySelector('.omd-definition');
    expect(definition?.querySelector('.omd-definition-label')?.textContent).toBe('[ref]:');
    expect(definition?.querySelector<HTMLAnchorElement>('.omd-definition-url')?.getAttribute('href')).toBe(
      'https://example.com'
    );
    root.remove();
  });
});

describe('editing elsewhere leaves reference links alone (#33)', () => {
  it('a typed character in an unrelated paragraph does not inline the links', async () => {
    const source = '# Title\n\n[ref]: https://example.com\n\nIntro.\n\nSee [ref] and [text][ref].\n';
    const { root, handle } = await mountEditor(source);
    const view = handle.getView();

    // Type into "Intro." — a paragraph that holds no reference at all.
    let at = -1;
    view.state.doc.descendants((node, pos) => {
      if (at < 0 && node.isText && node.text === 'Intro.') at = pos + 'Intro.'.length;
      return true;
    });
    expect(at).toBeGreaterThan(0);
    view.dispatch(view.state.tr.insertText('!', at));

    expect(handle.getMarkdown()).toBe(source.replace('Intro.', 'Intro.!'));
    root.remove();
  });
});
