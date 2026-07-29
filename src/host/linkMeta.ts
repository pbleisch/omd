import { lookup } from 'dns/promises';
import { parseLinkMeta, type LinkMeta } from '../shared/linkMeta';
import { isPrivateOrReservedIp } from './ssrf';

/**
 * Host-side link-preview fetch. The webview is CSP/CORS-blocked, so metadata for the `linkcard`
 * block is fetched here (Node has no same-origin policy) and parsed by the shared, pure
 * {@link parseLinkMeta}. Called only in response to an explicit `fetchLinkMeta` message — an
 * insert or a refresh — never on document load.
 *
 * Defensive by design: only http(s); an **SSRF guard** that resolves each URL's hostname and
 * rejects any that maps to a private/loopback/link-local/reserved address (threat-model R2), applied
 * to **every redirect hop** (redirects are followed manually so an off-site redirect to an internal
 * host is caught); an abort timeout; an HTML content-type check; and a byte cap so a hostile or
 * enormous page can't hang or balloon the extension host. Any failure returns null and the editor
 * keeps its placeholder card.
 */

const TIMEOUT_MS = 8000;
const MAX_BYTES = 1_000_000; // 1 MB — far more than any real <head> needs.
const MAX_REDIRECTS = 5;

/** Resolve `hostname` and return true only if every resolved address is a public host. */
async function hostIsPublic(hostname: string): Promise<boolean> {
  try {
    const addrs = await lookup(hostname, { all: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateOrReservedIp(a.address));
  } catch {
    return false; // DNS failure — fail closed
  }
}

/** An http(s) URL whose host resolves to a public address, or null. */
async function safeUrl(raw: string): Promise<URL | null> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  return (await hostIsPublic(u.hostname)) ? u : null;
}

export async function fetchLinkMeta(url: string): Promise<LinkMeta | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let current = await safeUrl(url);
    for (let hop = 0; current && hop <= MAX_REDIRECTS; hop++) {
      const res = await fetch(current.href, {
        signal: controller.signal,
        redirect: 'manual', // follow by hand so each hop's host is re-checked (no internal redirect)
        headers: {
          // A desktop UA — many sites serve no OpenGraph tags to unknown agents.
          'user-agent': 'Mozilla/5.0 (compatible; OMD-linkcard/1.0; +https://github.com/)',
          accept: 'text/html,application/xhtml+xml'
        }
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        current = location ? await safeUrl(new URL(location, current).href) : null;
        continue;
      }
      if (!res.ok) return null;
      const ctype = res.headers.get('content-type') ?? '';
      if (!/text\/html|application\/xhtml\+xml/i.test(ctype)) return null;
      const html = await readCapped(res, MAX_BYTES);
      // Use the final URL (after redirects) so a relative og:image resolves correctly.
      return parseLinkMeta(html, res.url || current.href);
    }
    return null; // blocked host, too many redirects, or an unparseable/relative-to-internal hop
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Read a response body as UTF-8 text, stopping once `max` bytes have arrived. */
async function readCapped(res: Response, max: number): Promise<string> {
  const body = res.body as ReadableStream<Uint8Array> | null;
  if (!body) return (await res.text()).slice(0, max);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.length;
        if (total >= max) {
          await reader.cancel();
          break;
        }
      }
    }
  } finally {
    reader.releaseLock?.();
  }
  return Buffer.concat(chunks).toString('utf8');
}
