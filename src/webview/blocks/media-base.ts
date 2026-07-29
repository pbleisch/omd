/**
 * Resolve image `src`s against the document's folder so **local media** loads under the webview
 * CSP. The doc keeps the raw relative path (`media/x.png`) for a clean round-trip; only the
 * rendered `<img>` src is rewritten to the webview URI the host supplies (`mediaBase`).
 *
 * Absolute srcs (http(s):, data:, an already-resolved webview URI, protocol-relative) pass through
 * unchanged — `new URL` ignores the base when the src is absolute.
 */
let base = '';

export function setMediaBase(next: string): void {
  base = next;
}

export function getMediaBase(): string {
  return base;
}

/** The URL to put on an `<img>` for a markdown src — relative paths joined to the document folder. */
export function resolveMediaSrc(src: string): string {
  if (!src || !base) return src;
  try {
    return new URL(src, base.endsWith('/') ? base : `${base}/`).toString();
  } catch {
    return src; // malformed src — leave it as-is rather than throw during render
  }
}
