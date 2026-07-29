/**
 * The media built-ins (`youtube`, `gallery`). Per docs/design/FORMATS.md a media block's *body* holds
 * real image/thumbnail markdown, so a reader on GitHub sees an actual clickable thumbnail or
 * a set of images — the shortcode only carries the parameters OMD reads back. Nothing here
 * fetches anything: thumbnails are derived from the video id, so the block works offline and
 * the editor never makes a network request on the user's behalf.
 */

/** A YouTube video id is 11 url-safe characters. */
const VIDEO_ID = /^[\w-]{11}$/;

/** Extract a video id from any common YouTube URL form, or null if it isn't one. */
export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (VIDEO_ID.test(s)) return s; // a bare id is accepted too

  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');

  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    return VIDEO_ID.test(id) ? id : null;
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const v = url.searchParams.get('v');
    if (v && VIDEO_ID.test(v)) return v;
    const m = /^\/(?:embed|shorts|v)\/([\w-]{11})/.exec(url.pathname);
    if (m) return m[1];
  }
  return null;
}

/** The thumbnail image URL — derived, never fetched, so it works without network access. */
export function youTubeThumbnail(id: string): string {
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

/** The canonical short watch URL the thumbnail links to. */
export function youTubeWatchUrl(id: string): string {
  return `https://youtu.be/${id}`;
}

/** Split a user-entered list of image URLs (comma or newline separated). */
export function parseImageList(input: string): string[] {
  return input
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
