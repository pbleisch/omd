import { $markSchema, $remark } from '@milkdown/utils';

/**
 * Semantic inline HTML tags as real marks. GFM has no syntax for these, but GitHub renders the
 * raw HTML — so that's what they serialize to, and round-trip through. Milkdown tokenizes inline
 * HTML as separate `html` mdast nodes (`<u>`, text, `</u>`), so on parse we fold matching
 * open/close pairs into one custom mark node; on stringify a remark handler emits the tags back.
 * This is the one place OMD writes raw HTML into the document, kept deliberately narrow to this
 * fixed allow-list of well-known, GitHub-rendered tags.
 */

/** The tags we fold into marks. `u/sub/sup` keep descriptive node names for back-compat; the
 * rest use the tag as the node name. */
const MARK_NAME: Record<string, string> = { u: 'underline', sub: 'subscript', sup: 'superscript' };
const markName = (tag: string): string => MARK_NAME[tag] ?? tag;
const HTML_MARK_TAGS = ['u', 'sub', 'sup', 'kbd', 'mark', 'samp', 'var', 'cite', 'small'] as const;

/** Tag → mark node name. */
const TAGS: Record<string, string> = Object.fromEntries(HTML_MARK_TAGS.map((t) => [t, markName(t)]));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MdNode = { type: string; value?: string; children?: any[] };

const openRe = new RegExp(`^<(${HTML_MARK_TAGS.join('|')})>$`, 'i');
const isOpen = (n: MdNode, tag: string) => n.type === 'html' && n.value?.trim().toLowerCase() === `<${tag}>`;
const isClose = (n: MdNode, tag: string) => n.type === 'html' && n.value?.trim().toLowerCase() === `</${tag}>`;

/** Fold `<tag>…</tag>` html-node runs into `{ type, children }` marks, recursing into content. */
function foldChildren(kids: MdNode[]): MdNode[] {
  const out: MdNode[] = [];
  for (let i = 0; i < kids.length; i++) {
    const k = kids[i];
    const m = k.type === 'html' && k.value ? openRe.exec(k.value.trim()) : null;
    if (m) {
      const tag = m[1].toLowerCase();
      let depth = 1;
      let close = -1;
      for (let j = i + 1; j < kids.length; j++) {
        if (isOpen(kids[j], tag)) depth++;
        else if (isClose(kids[j], tag) && --depth === 0) {
          close = j;
          break;
        }
      }
      if (close >= 0) {
        out.push({ type: TAGS[tag], children: foldChildren(kids.slice(i + 1, close)) });
        i = close;
        continue;
      }
    }
    if (k.children) k.children = foldChildren(k.children);
    out.push(k);
  }
  return out;
}

/** A remark stringify handler that wraps a mark's phrasing content in its HTML tag. */
function tagHandler(tag: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (node: any, _parent: any, state: any): string =>
    `<${tag}>${state.containerPhrasing(node, { before: '>', after: '<' })}</${tag}>`;
}

export const remarkInlineMarks = $remark('omd-inline-marks', () =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function (this: any) {
    const data = this.data();
    const ext = data.toMarkdownExtensions || (data.toMarkdownExtensions = []);
    ext.push({
      handlers: Object.fromEntries(HTML_MARK_TAGS.map((tag) => [markName(tag), tagHandler(tag)]))
    });
    return (tree: MdNode) => {
      if (tree.children) tree.children = foldChildren(tree.children);
    };
  } as never
);

/** Build a mark schema that renders as `tag` and serializes to `<tag>…</tag>`. */
function htmlMark(name: string, tag: string) {
  return $markSchema(name, () => ({
    parseDOM: [{ tag }],
    toDOM: () => [tag, 0] as [string, number],
    parseMarkdown: {
      match: (node) => node.type === name,
      runner: (state, node, markType) => {
        state.openMark(markType);
        state.next(node.children);
        state.closeMark(markType);
      }
    },
    toMarkdown: {
      match: (mark) => mark.type.name === name,
      runner: (state, mark) => {
        state.withMark(mark, name);
      }
    }
  }));
}

export const underlineSchema = htmlMark('underline', 'u');
export const subscriptSchema = htmlMark('subscript', 'sub');
export const superscriptSchema = htmlMark('superscript', 'sup');
export const kbdSchema = htmlMark('kbd', 'kbd');
export const markSchema = htmlMark('mark', 'mark');
export const sampSchema = htmlMark('samp', 'samp');
export const varSchema = htmlMark('var', 'var');
export const citeSchema = htmlMark('cite', 'cite');
export const smallSchema = htmlMark('small', 'small');
