import type { Node as ProseNode } from 'prosemirror-model';

/**
 * Heading anchors — GitHub-compatible slugs for the document's headings, used to offer anchor
 * autocomplete when a link URL starts with `#`. The slug rule mirrors GitHub's: lowercase, strip
 * punctuation, spaces → dashes, and de-duplicate collisions with a `-1`, `-2`, … suffix.
 */

export function headingSlug(text: string): string {
  // Matches GitHub's slugger: lowercase, strip punctuation (keeping word chars, spaces, dashes),
  // then turn *each* space into a dash — GitHub does not collapse runs, so `a  b` → `a--b`.
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s/g, '-');
}

export interface HeadingAnchor {
  text: string;
  level: number;
  slug: string;
}

export function documentHeadings(doc: ProseNode): HeadingAnchor[] {
  const out: HeadingAnchor[] = [];
  const seen = new Map<string, number>();
  doc.descendants((node) => {
    if (node.type.name !== 'heading') return true;
    const text = node.textContent.trim();
    if (!text) return true;
    let slug = headingSlug(text);
    const prior = seen.get(slug);
    if (prior === undefined) {
      seen.set(slug, 0);
    } else {
      const n = prior + 1;
      seen.set(slug, n);
      slug = `${slug}-${n}`;
    }
    out.push({ text, level: node.attrs.level as number, slug });
    return true;
  });
  return out;
}
