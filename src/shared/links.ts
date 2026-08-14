/**
 * Ordinary markdown link destinations — the pure half of following one.
 *
 * A markdown link means something different from a wikilink: `[a](docs/DESIGN.md)` resolves
 * **relative to the document that contains it**, not by page name anywhere in the workspace
 * (`shared/references` + `host/wikiResolve` are the wikilink rule). Everything here is a pure
 * function of the href so both sides of the process boundary can agree on what a destination is
 * without a filesystem; the host does the resolving (`host/linkResolve`).
 */

/** A markdown destination may be written `<like this>` when it contains spaces. */
function unwrapAngle(href: string): string {
  return href.startsWith('<') && href.endsWith('>') ? href.slice(1, -1) : href;
}

/** The URI scheme of a destination (`https`, `mailto`, …), or '' when it is relative.
 *  Two characters minimum, so a Windows drive letter (`c:/tmp/x.md`) is a path, not a scheme. */
export function schemeOf(href: string): string {
  return /^([a-z][a-z\d+.-]+):/i.exec(href.trim())?.[1].toLowerCase() ?? '';
}

export interface ParsedHref {
  /** The destination minus its `#fragment`, angle brackets and surrounding space. */
  path: string;
  /** The fragment, percent-decoded and lower-cased (a GitHub heading slug), or ''. */
  fragment: string;
}

/** Split a destination into the file part and the anchor part. */
export function parseHref(href: string): ParsedHref {
  const raw = unwrapAngle(href.trim());
  const hash = raw.indexOf('#');
  const path = hash === -1 ? raw : raw.slice(0, hash);
  const fragment = hash === -1 ? '' : raw.slice(hash + 1);
  return { path: path.trim(), fragment: decodeMaybe(fragment).toLowerCase() };
}

/** `decodeURIComponent` that survives a malformed escape (`100%` is legal in a filename). */
function decodeMaybe(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * The on-disk names to try for a link path, best first. `my%20doc.md` is percent-encoded markdown
 * for `my doc.md`, so the decoded form is tried first — but a file whose name literally contains
 * `%20` is legal too, so the raw form stays as the fallback rather than being assumed away.
 */
export function pathCandidates(path: string): string[] {
  const decoded = decodeMaybe(path);
  return decoded === path ? [path] : [decoded, path];
}

/**
 * The URL to hand the OS for a destination that leaves the workspace, or null when the link is a
 * file path. Only the three schemes a document legitimately links out with are followed —
 * anything else (`vscode:`, `javascript:`, a made-up scheme) is an author-controlled string and
 * is not worth handing to the platform's opener on a click.
 */
export function externalUrl(href: string): string | null {
  const raw = unwrapAngle(href.trim());
  if (raw.startsWith('//')) return `https:${raw}`; // protocol-relative
  const scheme = schemeOf(raw);
  return scheme === 'http' || scheme === 'https' || scheme === 'mailto' ? raw : null;
}
