import { describe, it, expect } from 'vitest';
import {
  MARKDOWN_GLOB,
  isDefaultFor,
  readAssociations,
  withMarkdownAssociation,
  withoutMarkdownAssociation
} from '../src/host/editorAssociations';
import manifest from '../package.json';

/**
 * OMD is not the default markdown editor on install — it registers at `priority: "option"` and
 * becomes the default only when the user runs the opt-in command, which writes a `*.md` entry into
 * `workbench.editorAssociations`.
 *
 * That setting is the *user's* map. The gate these tests guard is the one that would hurt: both
 * commands must merge into it and leave every unrelated entry alone. The end-to-end behaviour (does
 * a `.md` actually open in OMD afterwards) needs a real extension host and lives in
 * `src/integration-test/suite/default-editor.test.ts`.
 */

const OMD = 'omd.editor';

/** A map that looks like a real user's: entries we must never touch, on both sides of ours. */
const USER_ENTRIES = {
  '*.hex': 'hexEditor.hexedit',
  '*.svg': 'svgPreviewer.customEditor',
  '{**/*.jpg,**/*.png}': 'imagePreview.previewEditor'
} as const;

describe('editor associations: reading the raw setting', () => {
  it('reads a well-formed map through unchanged', () => {
    expect(readAssociations({ ...USER_ENTRIES })).toEqual(USER_ENTRIES);
  });

  it('treats a missing or non-object value as an empty map', () => {
    for (const raw of [undefined, null, 'nope', 42, ['*.md', 'omd.editor']]) {
      expect(readAssociations(raw)).toEqual({});
    }
  });

  it('drops non-string entries rather than writing them back', () => {
    // A hand-edited settings.json can hold anything; we would rather lose a malformed entry than
    // round-trip it into the setting or throw inside a command.
    expect(readAssociations({ '*.hex': 'hexEditor.hexedit', '*.bad': { nested: true }, '*.n': 7 })).toEqual({
      '*.hex': 'hexEditor.hexedit'
    });
  });
});

describe('editor associations: opting in', () => {
  it('adds the markdown entry to an empty map', () => {
    expect(withMarkdownAssociation({}, OMD)).toEqual({ [MARKDOWN_GLOB]: OMD });
  });

  it('preserves every unrelated entry', () => {
    const next = withMarkdownAssociation(USER_ENTRIES, OMD);
    expect(next).toEqual({ ...USER_ENTRIES, [MARKDOWN_GLOB]: OMD });
    for (const [glob, viewType] of Object.entries(USER_ENTRIES)) {
      expect(next[glob]).toBe(viewType);
    }
  });

  it('does not mutate the map it was given', () => {
    const before = { ...USER_ENTRIES };
    withMarkdownAssociation(before, OMD);
    expect(before).toEqual(USER_ENTRIES);
  });

  it('is idempotent — opting in twice serializes identically', () => {
    const once = withMarkdownAssociation(USER_ENTRIES, OMD);
    const twice = withMarkdownAssociation(once, OMD);
    expect(twice).toEqual(once);
    // Same key order too, so a second opt-in is a no-op on settings.json rather than a reshuffle.
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it('takes over a markdown entry that pointed somewhere else', () => {
    const foreign = { ...USER_ENTRIES, [MARKDOWN_GLOB]: 'vscode.markdown.preview.editor' };
    const next = withMarkdownAssociation(foreign, OMD);
    expect(next[MARKDOWN_GLOB]).toBe(OMD);
    expect(next['*.hex']).toBe('hexEditor.hexedit');
  });
});

describe('editor associations: opting back out', () => {
  it('removes the markdown entry and nothing else', () => {
    const opted = withMarkdownAssociation(USER_ENTRIES, OMD);
    expect(withoutMarkdownAssociation(opted)).toEqual(USER_ENTRIES);
  });

  it('removes rather than pinning the text editor', () => {
    // An explicit `"*.md": "default"` would keep overriding any markdown editor the user installs
    // later; "undo my opt-in" should mean absence, not a new opinion.
    const next = withoutMarkdownAssociation(withMarkdownAssociation({}, OMD));
    expect(MARKDOWN_GLOB in next).toBe(false);
    expect(next).toEqual({});
  });

  it('is harmless when OMD was never the default', () => {
    expect(withoutMarkdownAssociation(USER_ENTRIES)).toEqual(USER_ENTRIES);
    expect(withoutMarkdownAssociation({})).toEqual({});
  });

  it('does not mutate the map it was given', () => {
    const before = withMarkdownAssociation(USER_ENTRIES, OMD);
    const snapshot = { ...before };
    withoutMarkdownAssociation(before);
    expect(before).toEqual(snapshot);
  });
});

describe('editor associations: isDefaultFor drives the idempotent messages', () => {
  it('is true only when markdown points at OMD', () => {
    expect(isDefaultFor(withMarkdownAssociation({}, OMD), OMD)).toBe(true);
    expect(isDefaultFor({}, OMD)).toBe(false);
    expect(isDefaultFor(USER_ENTRIES, OMD)).toBe(false);
    expect(isDefaultFor({ [MARKDOWN_GLOB]: 'default' }, OMD)).toBe(false);
  });
});

describe('manifest: OMD does not take over markdown on install', () => {
  const editor = manifest.contributes.customEditors.find((e) => e.viewType === 'omd.editor');

  it('registers the custom editor at "option", not "default"', () => {
    // `priority` is static manifest metadata — an extension cannot change its own priority at
    // runtime. "option" is what makes a fresh install change nothing, and it is a legal
    // `workbench.editorAssociations` target (only "never" is skipped by the resolver).
    expect(editor?.priority).toBe('option');
    expect(editor?.selector).toEqual([{ filenamePattern: MARKDOWN_GLOB }]);
  });

  it('contributes both the opt-in and the opt-out command, titled the OMD way', () => {
    const byId = new Map(manifest.contributes.commands.map((c) => [c.command, c.title]));
    expect(byId.get('omd.makeDefaultEditor')).toBe('OMD: Make OMD the default Markdown editor');
    expect(byId.get('omd.restoreDefaultEditor')).toBe('OMD: Restore the built-in Markdown editor');
    // The per-file try-before-you-commit path is untouched by the opt-in work.
    expect(byId.get('omd.openWith')).toBe('OMD: Open in OMD editor');
    expect(byId.get('omd.reopenAsText')).toBe('OMD: Reopen as plain text');
  });

  it('leaves both commands unconditionally visible in the Command Palette', () => {
    // A `commandPalette` `when` clause would hide them exactly when they are needed: cold, with no
    // `.md` open. Activation is implicit for contributed commands (VS Code ≥ 1.74), so an empty
    // `activationEvents` is correct — but only if nothing gates the palette entry.
    const gated = manifest.contributes.menus.commandPalette.map((m) => m.command);
    expect(gated).not.toContain('omd.makeDefaultEditor');
    expect(gated).not.toContain('omd.restoreDefaultEditor');
    expect(manifest.engines.vscode).toBe('^1.90.0');
  });
});
