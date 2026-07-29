/**
 * Link-preview metadata, shared by host and editor. The host fetches a URL and parses its
 * `<head>` into a {@link LinkMeta}; the editor caches those fields in the `linkcard` shortcode's
 * params so the card renders offline and round-trips byte-for-byte (docs/design/FORMATS.md, mirroring the
 * chart block's cached output). Everything here is pure and string-only — no network, no DOM — so
 * both processes import it and the parser is unit-testable without a real host.
 */

export interface LinkMeta {
  /** og:title → twitter:title → `<title>`. */
  title: string;
  /** og:description → twitter:description → `<meta name="description">`. */
  description: string;
  /** og:image (absolutized against the page URL); empty when none. */
  image: string;
  /** og:site_name, falling back to the URL's hostname. */
  site: string;
}

/** The hostname of a URL without a leading `www.`, or '' if it isn't a valid URL. */
export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Resolve a possibly-relative asset URL against the page it was found on. */
function absolutize(src: string, baseUrl: string): string {
  try {
    return new URL(src, baseUrl).href;
  } catch {
    return src;
  }
}

/** Decode the handful of HTML entities that show up in title/description/OG content. */
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => codePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => codePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&(?:apos|#39);/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&'); // ampersand last, so it doesn't re-open decoded entities
}

function codePoint(n: number): string {
  return Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
}

/** Read one attribute's value from a single tag string, tolerating quote style and order. */
function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(tag);
  if (!m) return null;
  return m[2] ?? m[3] ?? m[4] ?? '';
}

/**
 * Parse OpenGraph / Twitter-card / standard `<head>` metadata out of an HTML document. `baseUrl`
 * is the page's own URL, used to resolve a relative `og:image` and to supply the site fallback.
 * Missing fields come back as '' (except `site`, which falls back to the hostname) — the caller
 * decides how to present an empty card.
 */
export function parseLinkMeta(html: string, baseUrl: string): LinkMeta {
  // Scope to <head> when present so a huge <body> doesn't dominate the scan; fall back to the
  // whole document for pages that omit an explicit <head>.
  const head = /<head[\s>][\s\S]*?<\/head>/i.exec(html);
  const scope = head ? head[0] : html;

  // First value wins for each key, matching how a browser treats duplicate meta tags.
  const meta = new Map<string, string>();
  for (const tag of scope.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attr(tag, 'property') ?? attr(tag, 'name'))?.toLowerCase();
    const content = attr(tag, 'content');
    if (key && content != null && !meta.has(key)) meta.set(key, decodeEntities(content.trim()));
  }

  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(scope);
  const docTitle = titleTag ? decodeEntities(titleTag[1].trim()) : '';

  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = meta.get(k);
      if (v) return v;
    }
    return '';
  };

  const image = pick('og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src');
  return {
    title: pick('og:title', 'twitter:title') || docTitle,
    description: pick('og:description', 'twitter:description', 'description'),
    image: image ? absolutize(image, baseUrl) : '',
    site: pick('og:site_name') || hostnameOf(baseUrl)
  };
}
