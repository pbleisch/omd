import type { Node as ProseNode } from 'prosemirror-model';
import { createOmdEditor, type OmdEditorHandle } from '../../src/webview/editor';

/** Mount a live editor into a detached root and return both for DOM assertions. */
export async function mountEditor(
  markdown: string
): Promise<{ root: HTMLElement; handle: OmdEditorHandle }> {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const handle = await createOmdEditor({ root, initial: markdown, onEdit: () => {} });
  return { root, handle };
}

/**
 * Boot a headless OMD editor over the given markdown and read it straight back.
 * This exercises the real parse -> ProseMirror doc -> serialize path that the live
 * editor uses, which is exactly what Principle 2 (the round-trip) is about.
 */
export async function roundTrip(markdown: string): Promise<string> {
  return (await roundTripDoc(markdown)).output;
}

/**
 * The round trip plus the document it started from, for the second half of hard gate 1:
 * bytes that survive but re-parse to a *different* document still destroy the file
 * (a leading `---` becoming front matter, a dropped escape splitting a table row). Assert
 * `parse(serialize(D)) ≡ D` by handing `output` back through here and comparing `doc`.
 */
export async function roundTripDoc(
  markdown: string
): Promise<{ output: string; doc: ProseNode }> {
  const root = document.createElement('div');
  document.body.appendChild(root);
  try {
    const handle = await createOmdEditor({
      root,
      initial: markdown,
      onEdit: () => {}
    });
    return { output: handle.getMarkdown(), doc: handle.getView().state.doc };
  } finally {
    root.remove();
  }
}
