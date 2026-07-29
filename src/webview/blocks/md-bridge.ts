import type { Node as ProseNode } from 'prosemirror-model';

/**
 * A tiny registry that lets code outside the editor module reach Milkdown's markdown parser and
 * serializer without importing the whole `Editor`. Registered once in editor.ts after the editor
 * is created (mirrors the `blocks`/`threads` registries). Used by the AI block to turn a model's
 * markdown answer into document nodes, and to hand the whole document to the model as context.
 */

interface MdBridge {
  /** Parse markdown into a ProseMirror doc node (top-level blocks live in `.content`). */
  parse: (markdown: string) => ProseNode | null;
  /** Serialize the current document back to markdown (already fixed-up for round-trip). */
  serialize: () => string;
}

let bridge: MdBridge | null = null;

export function setMdBridge(next: MdBridge): void {
  bridge = next;
}

/** Parse markdown to a doc node, or null when the bridge isn't ready or parsing fails. */
export function parseMarkdownDoc(markdown: string): ProseNode | null {
  try {
    return bridge ? bridge.parse(markdown) : null;
  } catch {
    return null;
  }
}

/** The current document as markdown, or '' when the bridge isn't ready. */
export function currentMarkdown(): string {
  try {
    return bridge ? bridge.serialize() : '';
  } catch {
    return '';
  }
}
