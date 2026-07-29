/**
 * The pure map arithmetic behind "make OMD the default markdown editor".
 *
 * OMD registers its custom editor at `priority: "option"` (see `contributes.customEditors` in
 * `package.json`), so installing it changes nothing about which editor opens a `.md`. Becoming the
 * default is an explicit opt-in, and the only runtime lever for that is VS Code's
 * `workbench.editorAssociations` setting — a flat `{ glob: viewType }` map that the editor resolver
 * consults *before* falling back to registered priority. An `option`-priority editor is a legal
 * association target (only `never` is excluded), which is exactly why this works.
 *
 * That setting belongs to the user, not to us: it may already hold their own entries for other file
 * types. Every function here therefore returns a **new map with only the markdown entry touched** —
 * never a replacement for the whole map. This module deliberately does not import `vscode`, so the
 * merge rules are unit-testable outside an extension host (`test/editor-associations.test.ts`);
 * `defaultEditor.ts` owns the configuration I/O.
 */

/** The glob OMD claims when it is the default. Matches the `customEditors` selector in the manifest. */
export const MARKDOWN_GLOB = '*.md';

/** The view type of the built-in text editor, as `workbench.editorAssociations` spells it. */
export const DEFAULT_TEXT_EDITOR_VIEW_TYPE = 'default';

/** A `workbench.editorAssociations` value: glob pattern → editor view type. */
export type EditorAssociations = Readonly<Record<string, string>>;

/**
 * Read a raw setting value defensively. `workbench.editorAssociations` is `type: "object"` with
 * `additionalProperties: { type: "string" }`, but a hand-edited `settings.json` can hold anything,
 * and we would rather drop a malformed entry than write it back or throw inside a command.
 */
export function readAssociations(raw: unknown): EditorAssociations {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [glob, viewType] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof viewType === 'string') out[glob] = viewType;
  }
  return out;
}

/** Whether `associations` already points markdown at `viewType`. */
export function isDefaultFor(associations: EditorAssociations, viewType: string): boolean {
  return associations[MARKDOWN_GLOB] === viewType;
}

/**
 * The same map with markdown pointed at `viewType`. Insertion order is preserved for entries that
 * already exist, so opting in twice is a genuine no-op on the serialized JSON rather than a
 * reshuffle of the user's `settings.json`.
 */
export function withMarkdownAssociation(
  associations: EditorAssociations,
  viewType: string
): EditorAssociations {
  return { ...associations, [MARKDOWN_GLOB]: viewType };
}

/**
 * The same map with the markdown entry removed, handing `.md` back to whatever VS Code would have
 * opened it with — for a fresh OMD install, the built-in editor.
 *
 * Removal, not `'default'`: an explicit `"*.md": "default"` entry would pin the text editor even if
 * the user later installs another markdown editor, which is more than "undo my opt-in" should mean.
 */
export function withoutMarkdownAssociation(associations: EditorAssociations): EditorAssociations {
  const out = { ...associations };
  delete out[MARKDOWN_GLOB];
  return out;
}
