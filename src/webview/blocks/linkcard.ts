import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import { post } from '../vscode';
import { hostnameOf, type LinkMeta } from '../../shared/linkMeta';
import { parseParams, stringifyParams, buildOpen } from '../../shared/shortcode';

/**
 * The `linkcard` built-in (docs/design/FORMATS.md coexistence form). On disk it's a container whose params
 * cache the fetched preview (title/description/image/site) and whose body is a plain `[title](url)`
 * link — so OMD draws a rich card while a GitHub reader sees a normal link, and the file round-trips
 * byte-for-byte. Metadata is fetched host-side (the webview is CSP/CORS-blocked) only on an explicit
 * insert or refresh; on load the card renders from the cached params with no network.
 */

export { hostnameOf };

/** True if `url` is an http(s) URL — the only kind a card links to or fetches. */
export function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** The card's display title: the cached title, else the URL's hostname, else the raw URL. */
export function cardTitle(params: Record<string, unknown>): string {
  const title = String(params.title ?? '').trim();
  const url = String(params.url ?? '');
  return title || hostnameOf(url) || url;
}

/** Build the linkcard params object from a URL + fetched metadata; empty fields are omitted. */
export function linkcardParams(url: string, meta: LinkMeta | null): Record<string, unknown> {
  const p: Record<string, unknown> = { url };
  if (meta) {
    if (meta.title) p.title = meta.title;
    if (meta.description) p.description = meta.description;
    if (meta.image) p.image = meta.image;
    if (meta.site) p.site = meta.site;
  }
  return p;
}

/** The GitHub-visible body: a single `[title](url)` link paragraph (hidden in OMD). */
export function linkcardBody(state: EditorState, url: string, title: string): PMNode[] {
  const link = state.schema.marks.link.create({ href: url });
  return [state.schema.nodes.paragraph.create(null, state.schema.text(title || url, [link]))];
}

// --- host request/response, correlated by nonce (the editor initiates, unlike ping/pong) ---

const pending = new Map<string, (meta: LinkMeta | null) => void>();
let seq = 0;

/** Ask the host to fetch preview metadata for `url`; resolves null on failure or timeout. */
export function requestLinkMeta(url: string): Promise<LinkMeta | null> {
  const nonce = `lc-${Date.now()}-${seq++}`;
  return new Promise((resolve) => {
    pending.set(nonce, resolve);
    post({ type: 'fetchLinkMeta', nonce, url });
    // Don't leak the resolver if the host never answers (e.g. window reloaded mid-flight).
    setTimeout(() => {
      if (pending.delete(nonce)) resolve(null);
    }, 15000);
  });
}

/** Route a host `linkMeta` reply to its waiting request (called from the message pump). */
export function resolveLinkMeta(nonce: string, meta: LinkMeta | null): void {
  const resolve = pending.get(nonce);
  if (resolve) {
    pending.delete(nonce);
    resolve(meta);
  }
}

// --- applying fetched metadata back into the document ---

/**
 * Write `meta` into the linkcard at `pos`: refresh its cached params and regenerate the
 * `[title](url)` body, in one transaction. Used by the refresh action (exact position known).
 */
export function applyLinkcardMeta(view: EditorView, pos: number, url: string, meta: LinkMeta): void {
  const node = view.state.doc.nodeAt(pos);
  if (!node || node.attrs.name !== 'linkcard') return;
  const params = linkcardParams(url, meta);
  const p = stringifyParams(params);
  const body = linkcardBody(view.state, url, cardTitle(params));

  const tr = view.state.tr;
  tr.replaceWith(pos + 1, pos + node.nodeSize - 1, body); // replace the container's inner body
  tr.setNodeMarkup(pos, undefined, { ...node.attrs, params: p, openRaw: buildOpen('linkcard', p) });
  view.dispatch(tr);
}

/**
 * After an insert, fill the first still-unfilled linkcard matching `url` (its title is empty
 * because the placeholder used the hostname). Position isn't known ahead of the async fetch, so
 * we locate the node by URL rather than tracking a shifting position.
 */
export function fillInsertedLinkcard(view: EditorView, url: string, meta: LinkMeta): void {
  let found = -1;
  view.state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.type.name === 'shortcode_container' && node.attrs.name === 'linkcard') {
      const params = parseParams(node.attrs.params as string);
      if (String(params.url ?? '') === url && !params.title) {
        found = pos;
        return false;
      }
    }
    return true;
  });
  if (found >= 0) applyLinkcardMeta(view, found, url, meta);
}
