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
  const root = document.createElement('div');
  document.body.appendChild(root);
  try {
    const handle = await createOmdEditor({
      root,
      initial: markdown,
      onEdit: () => {}
    });
    return handle.getMarkdown();
  } finally {
    root.remove();
  }
}
