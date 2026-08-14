import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey, type EditorState, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { Node as ProseNode } from 'prosemirror-model';
import { WIKILINK_RE, parseWikilink, isMentionLink, isIssueLink } from '../../shared/references';
import { followTitle, headingSlugPositions } from './link-follow';

/**
 * Inline references in the editor. Wikilinks are plain text on disk (`[[Roadmap]]`), so they
 * are rendered with decorations: the brackets and the `|target` are hidden as machinery and
 * the label is styled as a link. Mentions and issues are already *real* markdown links, so
 * they only get a chip style. Decoration-only — nothing is rewritten, so the round-trip holds.
 *
 * Rendering and validation only. *Following* a reference lives in `link-follow.ts`, with every
 * other inline link form, so the whole document navigates the same way.
 */

interface WikiHit {
  from: number;
  to: number;
  labelFrom: number;
  labelTo: number;
  target: string;
}

/** True when a text node is inline code — its content is literal, not a reference. */
function isInlineCode(node: ProseNode): boolean {
  return node.marks.some((m) => m.type.name === 'inlineCode');
}

/** Locate every `[[…]]` in the document, with the positions of its parts. */
export function findWikilinks(doc: ProseNode): WikiHit[] {
  const hits: WikiHit[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text || isInlineCode(node)) return true; // `[[x]]` in code is literal
    WIKILINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = WIKILINK_RE.exec(node.text))) {
      const { target } = parseWikilink(m[1] + (m[2] !== undefined ? `|${m[2]}` : ''));
      const from = pos + m.index;
      // The label is the first capture; it always starts right after the `[[`.
      const labelFrom = from + 2;
      hits.push({
        from,
        to: from + m[0].length,
        labelFrom,
        labelTo: labelFrom + m[1].length,
        target
      });
    }
    return true;
  });
  return hits;
}

/** The hover tooltip for a wikilink: the page it opens, in GitHub's dashed `.md` file form. */
function wikiTargetTitle(target: string): string {
  const bare = target.trim().replace(/\.md$/i, '');
  return `${bare.replace(/ /g, '-')}.md`;
}

function buildDecorations(doc: ProseNode, broken: ReadonlySet<string>): DecorationSet {
  const decos: Decoration[] = [];

  for (const hit of findWikilinks(doc)) {
    // Hide `[[` and everything from the end of the label to `]]` (the pipe + target).
    decos.push(Decoration.inline(hit.from, hit.labelFrom, { class: 'omd-ref-machinery' }));
    decos.push(Decoration.inline(hit.labelTo, hit.to, { class: 'omd-ref-machinery' }));
    decos.push(
      Decoration.inline(hit.labelFrom, hit.labelTo, {
        class: 'omd-wikilink',
        'data-target': hit.target,
        // Hovering shows where it goes — the resolved page file — and how to get there.
        title: followTitle(wikiTargetTitle(hit.target))
      })
    );
  }

  // Every real link gets a hover tooltip showing its target; mentions/issues also get chip styling.
  // A link that fails a check is marked inline: a missing relative file (error, red) or a warning
  // (amber) for an empty target or an anchor that matches no heading — the inline replacement for
  // the Problems panel (which can't reveal a range inside a custom editor).
  const headingSlugs = new Set(headingSlugPositions(doc).map((h) => h.slug));
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text || isInlineCode(node)) return true;
    const link = node.marks.find((m) => m.type.name === 'link');
    if (!link) return true;
    const href = String(link.attrs.href ?? '').trim();

    let problem: { class: string; title: string } | null = null;
    if (href === '') {
      problem = { class: 'omd-link-warning', title: 'Link has no target.' };
    } else if (broken.has(href)) {
      problem = { class: 'omd-link-broken', title: `Linked file not found: ${href}` };
    } else if (href.startsWith('#')) {
      const anchor = decodeURIComponent(href.slice(1)).toLowerCase();
      if (anchor && !headingSlugs.has(anchor))
        problem = { class: 'omd-link-warning', title: `No heading matches "#${anchor}".` };
    }

    const classes = [
      isMentionLink(node.text, href) ? 'omd-mention' : isIssueLink(node.text, href) ? 'omd-issue' : '',
      problem?.class ?? ''
    ].filter(Boolean);
    const attrs: Record<string, string> = {};
    // A problem replaces the hover text: a link that doesn't resolve can't be followed, so the
    // "how to follow it" hint would be a lie.
    attrs.title = problem?.title ?? (href ? followTitle(href) : '');
    if (classes.length) attrs.class = classes.join(' ');
    if (attrs.title || classes.length) decos.push(Decoration.inline(pos, pos + node.nodeSize, attrs));
    return true;
  });

  return DecorationSet.create(doc, decos);
}

interface RefState {
  broken: ReadonlySet<string>;
}

const key = new PluginKey<RefState>('omd-references');

/** Update the set of unresolved link targets the host reported; links matching are marked broken. */
export function setBrokenLinks(view: { state: EditorState; dispatch: (tr: Transaction) => void }, targets: string[]): void {
  view.dispatch(view.state.tr.setMeta(key, new Set(targets)));
}

export const referencesPlugin = $prose(
  () =>
    new Plugin<RefState>({
      key,
      state: {
        init: () => ({ broken: new Set<string>() }),
        apply(tr, value) {
          const next = tr.getMeta(key) as Set<string> | undefined;
          return next ? { broken: next } : value;
        }
      },
      props: {
        decorations(state) {
          return buildDecorations(state.doc, key.getState(state)?.broken ?? new Set());
        }
      }
    })
);
