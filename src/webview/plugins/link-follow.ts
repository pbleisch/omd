import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Node as ProseNode } from 'prosemirror-model';
import { parseHref } from '../../shared/links';
import { slugify } from '../../shared/diagnostics';
import { post, log } from '../vscode';

/**
 * Following an inline link. **Cmd+click on macOS, Ctrl+click elsewhere** — never a plain click:
 * this is a WYSIWYG editor, and a plain click on link text is how a writer puts the cursor in it
 * to edit it. VS Code's own editors draw the same line, and every inline link form OMD renders
 * follows it uniformly: ordinary links, reference-style links, mentions, issues and wikilinks.
 * (The outline panel and the link card are not editable text and stay plain clicks.)
 *
 * The split of labour is the architectural one: a `#anchor` into the open document is a scroll
 * the editor does itself, and everything else is a request to the host, which owns the
 * filesystem and is the only side that can resolve a path or open an editor.
 *
 * Navigation only — no transaction touches the document, so the round-trip is untouched.
 */

const isMac = /mac|iphone|ipad|ipod/i.test(
  (typeof navigator !== 'undefined' && (navigator.platform || navigator.userAgent)) || ''
);

/** The modifier that turns a click into "follow", as the platform writes it. */
export const FOLLOW_MODIFIER = isMac ? '⌘' : 'Ctrl';

/** True when this event carries the follow modifier. Ctrl is the macOS context-menu chord, so
 *  there the modifier is Cmd and only Cmd. */
export function isFollowModifier(event: MouseEvent | KeyboardEvent): boolean {
  return isMac ? event.metaKey : event.ctrlKey;
}

/** A link's hover text: where it goes, plus how to get there. */
export function followTitle(target: string): string {
  return `${target}\nFollow link (${FOLLOW_MODIFIER} + click)`;
}

/** Every heading's GitHub slug and document position, de-duplicated the way GitHub does it. */
export function headingSlugPositions(doc: ProseNode): Array<{ slug: string; pos: number }> {
  const seen = new Map<string, number>();
  const out: Array<{ slug: string; pos: number }> = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return true;
    const base = slugify(node.textContent);
    if (!base) return false;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.push({ slug: n === 0 ? base : `${base}-${n}`, pos });
    return false;
  });
  return out;
}

/**
 * Scroll to the heading with `slug` and put the cursor there. Returns false when no heading
 * matches — the anchor is already marked with an inline warning, so this stays quiet.
 */
export function revealAnchor(view: EditorView, slug: string): boolean {
  const hit = headingSlugPositions(view.state.doc).find((h) => h.slug === slug);
  if (!hit) return false;
  const tr = view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(hit.pos + 1)));
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

/** The destination of the link under a click, or null when the click was not on one. */
function destinationAt(target: EventTarget | null): { kind: 'wiki' | 'link'; value: string } | null {
  const el = target instanceof Element ? target : null;
  if (!el) return null;
  // A wikilink is decoration-rendered (plain text on disk), so it carries its target in a dataset
  // attribute rather than an href.
  const wiki = el.closest<HTMLElement>('.omd-wikilink');
  if (wiki?.dataset.target) return { kind: 'wiki', value: wiki.dataset.target };
  // Everything else — ordinary links, reference-style links, mention and issue chips — is a real
  // anchor. Read the attribute, not `.href`: the property is resolved against the webview's own
  // origin, which turns `docs/DESIGN.md` into a `vscode-webview://…` URL.
  const href = el.closest('a')?.getAttribute('href')?.trim();
  return href ? { kind: 'link', value: href } : null;
}

const key = new PluginKey('omd-link-follow');

export const linkFollowPlugin = $prose(
  () =>
    new Plugin({
      key,
      props: {
        handleDOMEvents: {
          click(view, event) {
            if (!isFollowModifier(event)) return false;
            const dest = destinationAt(event.target);
            if (!dest) return false;
            // Claim the click either way: the writer asked to follow, so the browser must not
            // also try to navigate the webview to the href.
            event.preventDefault();
            event.stopPropagation();
            if (dest.kind === 'wiki') {
              post({ type: 'openTarget', target: dest.value });
              return true;
            }
            const { path, fragment } = parseHref(dest.value);
            if (!path) {
              // A same-document anchor: no host round-trip, the editor already holds the doc.
              if (fragment && !revealAnchor(view, fragment))
                log('info', `[link] no heading matches "#${fragment}" in this document`);
              return true;
            }
            post({ type: 'openLink', href: dest.value });
            return true;
          }
        }
      },
      /**
       * The affordance: while the modifier is held, links read as clickable (pointer cursor,
       * underline on hover) the way they do in VS Code's editors. Without it they are ordinary
       * text, which is the truth — a plain click there edits.
       */
      view(editorView) {
        const arm = (on: boolean) => editorView.dom.classList.toggle('omd-follow-armed', on);
        const onKey = (e: KeyboardEvent) => arm(isFollowModifier(e));
        const disarm = () => arm(false);
        window.addEventListener('keydown', onKey);
        window.addEventListener('keyup', onKey);
        window.addEventListener('blur', disarm);
        return {
          destroy() {
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('keyup', onKey);
            window.removeEventListener('blur', disarm);
          }
        };
      }
    })
);
