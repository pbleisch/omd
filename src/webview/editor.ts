import {
  Editor,
  rootCtx,
  defaultValueCtx,
  editorViewOptionsCtx,
  editorViewCtx,
  remarkStringifyOptionsCtx,
  parserCtx
} from '@milkdown/core';
import type { EditorView } from 'prosemirror-view';
import { commonmark, remarkInlineLinkPlugin } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { replaceAll, getMarkdown } from '@milkdown/utils';
import { diffDocument } from './doc-diff';
import { tightBulletList, tightListItem } from './plugins/tight-lists';
import { applySerializeFixups } from './plugins/serialize-fixups';
import { omdStringifyHandlers } from './plugins/stringify-handlers';
import { definitionHandler } from './plugins/reference-links';
import { calloutPlugin } from './plugins/callouts';
import { taskListPlugin } from './plugins/task-lists';
import { dateTokenPlugin } from './plugins/date-token';
import { commentsPlugin } from './plugins/comments';
import { revisePlugin } from './plugins/revise/plugin';
import { referencesPlugin } from './plugins/references';
import { linkFollowPlugin } from './plugins/link-follow';
import { smartPastePlugin } from './plugins/smart-paste';
import { mentionMenuPlugin } from './ui/mention-menu';
import { emojiMenuPlugin } from './ui/emoji-menu';
import { emojiDecorationPlugin } from './plugins/emoji-decoration';
import { codeHighlightPlugin } from './plugins/code-highlight';
import { codeBlockView } from './plugins/code-block-view';
import { remarkMathPlugin, mathInlineSchema, mathBlockSchema } from './plugins/math/schema';
import { mathInlineView, mathBlockView } from './plugins/math/view';
import {
  remarkShortcode,
  shortcodeLeafSchema,
  shortcodeContainerSchema
} from './plugins/shortcode/schema';
import { shortcodeLeafView, shortcodeContainerView } from './plugins/shortcode/view';
import { remarkAligned, alignedSchema } from './plugins/aligned/schema';
import { remarkMedia, mediaImageSchema } from './plugins/media/schema';
import { mediaImageView, bareImageView } from './plugins/media/view';
import { remarkDetails, detailsSchema } from './plugins/collapsible/schema';
import { detailsView } from './plugins/collapsible/view';
import { remarkColumns, columnsSchema, columnSchema } from './plugins/columns/schema';
import { columnsKeymap } from './plugins/columns/keymap';
import { tableNavKeymap } from './plugins/table-nav';
import { tableClipboard } from './plugins/table-clipboard';
import { tableControlsPlugin } from './plugins/table-controls';
import { remarkFrontmatterPlugin, frontmatterSchema } from './plugins/frontmatter/schema';
import { frontmatterView } from './plugins/frontmatter/view';
import {
  remarkInlineMarks,
  underlineSchema,
  subscriptSchema,
  superscriptSchema,
  kbdSchema,
  markSchema,
  sampSchema,
  varSchema,
  citeSchema,
  smallSchema
} from './plugins/inline-marks/schema';
import { remarkAutolinks, autolinkSchema, autolinkInputRule } from './plugins/autolinks';
import {
  remarkReferenceLinks,
  definitionSchema,
  linkReferenceSchema,
  imageReferenceSchema
} from './plugins/reference-links';
import { remarkHardBreak, hardBreakSchema } from './plugins/hardbreak';
import { remarkEntities, entitySchema } from './plugins/entities';
import { omdKeymap } from './commands/keymap';
import { historyPlugin, historyKeymap } from './commands/history';
import { stateEventsPlugin } from './commands/state-events';
import { headingFoldPlugin } from './plugins/heading-fold';
import { escapedMdPlugin } from './plugins/escaped-md';
import { slashPlugin } from './ui/slash';
import { contextMenuPlugin } from './plugins/context-menu';
import { findReplacePlugin } from './plugins/find/find-plugin';
import { dragHandlePlugin } from './plugins/drag-handle';
import { setMdBridge } from './blocks/md-bridge';

export interface OmdEditorHandle {
  /** Replace the whole document (host -> editor push). Does not emit an edit. */
  setMarkdown(markdown: string): void;
  /** Current serialized markdown (editor -> host). */
  getMarkdown(): string;
  /** The underlying ProseMirror view (for plugins/tests that need direct access). */
  getView(): EditorView;
}

export interface OmdEditorOptions {
  root: HTMLElement;
  initial: string;
  /** Fired when the user changes the document; not fired for programmatic setMarkdown. */
  onEdit: (markdown: string) => void;
}

/**
 * The writing surface: Milkdown (ProseMirror) with CommonMark + GFM presets — the
 * round-trip baseline (docs/design/DEPENDENCIES.md). The document model is markdown the
 * whole way through; this is a rich view over it, never a separate format.
 */
export async function createOmdEditor(opts: OmdEditorOptions): Promise<OmdEditorHandle> {
  // The canonical markdown the editor last settled on — either loaded via setMarkdown or
  // emitted as a user edit. `markdownUpdated` is debounced (lodash), so a programmatic load's
  // echo fires *after* any synchronous flag would have reset; matching the echo's *content*
  // against this instead makes the guard immune to that timing. An update whose serialization
  // equals `lastEmitted` is a no-op echo (a load) and is never bounced back to the host (#14).
  let lastEmitted: string | null = null;

  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, opts.root);
      ctx.set(defaultValueCtx, opts.initial);
      // Serialize to the GFM conventions a hand-writer uses, so open->save is
      // byte-stable (Principle 2) rather than silently rewritten (`*`->`-`,
      // `***`->`---`, one-space list indent).
      ctx.update(remarkStringifyOptionsCtx, (prev) => ({
        ...prev,
        // Layered over Milkdown's handler table: a document-initial thematic break must not
        // be `---` (it reopens as front matter, #23), and text is always escaped through
        // `state.safe()` (Milkdown's bypass drops escapes, #30). See stringify-handlers.ts.
        // `definition` keeps a link definition's own bytes (#33); see reference-links.ts.
        handlers: { ...prev.handlers, ...omdStringifyHandlers, definition: definitionHandler },
        bullet: '-',
        bulletOrdered: '.',
        rule: '-',
        ruleRepetition: 3,
        ruleSpaces: false,
        listItemIndent: 'one',
        emphasis: '_',
        strong: '*',
        fence: '`',
        fences: true,
        resourceLink: false,
        incrementListMarker: true,
        tightDefinitions: true
      }));
      ctx.update(editorViewOptionsCtx, (prev) => ({
        ...prev,
        attributes: { class: 'omd-prose', spellcheck: 'true' }
      }));
      ctx.get(listenerCtx).markdownUpdated((_ctx, markdown, prevMarkdown) => {
        if (markdown === prevMarkdown) return;
        // Emit the same fixed-up bytes `getMarkdown()` produces — otherwise the live edit writes
        // milkdown's raw serialization (which escapes `\[\[` wikilinks and `\[!NOTE]` alerts),
        // churning the file and breaking wikilink/backlink detection.
        const fixed = applySerializeFixups(markdown);
        if (fixed === lastEmitted) return; // a no-op echo (e.g. a programmatic load), not a user edit
        lastEmitted = fixed;
        opts.onEdit(fixed);
      });
    })
    // Before commonmark so it captures a literal `<br>` as an `omdBr` node before the preset's
    // own inline-HTML handling drops it (verified: the lowercase `<br>` is gone by the time a
    // later remark plugin runs).
    .use(remarkHardBreak)
    // Also before commonmark, so text nodes still carry the source positions the entity split needs
    // (the preset's soft-break handling otherwise splits/strips them on later lines).
    .use(remarkEntities)
    // The preset minus `remark-inline-links`, which is a *parse* plugin: it deletes every
    // `definition` and rewrites every `linkReference` to an inline link before the document
    // reaches the editor, so reference-style links were destroyed on load and no serializer
    // change could undo it (#33). The schema that now holds them is `reference-links.ts`.
    .use(commonmark.filter((plugin) => plugin !== remarkInlineLinkPlugin.plugin))
    // Before gfm so it gets first crack at Tab/Enter inside a table; it defers off a table.
    .use(tableNavKeymap)
    .use(tableClipboard)
    .use(gfm)
    .use(listener)
    .use(tightBulletList)
    .use(tightListItem)
    .use(calloutPlugin)
    .use(taskListPlugin)
    .use(dateTokenPlugin)
    // P6 collaboration — anchored comment regions (anchors hidden, text highlighted).
    .use(commentsPlugin)
    // AI inline revision — a decoration-only diff over a selection (doc untouched until Accept).
    .use(revisePlugin)
    .use(referencesPlugin)
    // Cmd/Ctrl+click follows any inline link — after references, which renders them.
    .use(linkFollowPlugin)
    .use(smartPastePlugin)
    .use(mentionMenuPlugin)
    .use(emojiMenuPlugin)
    .use(emojiDecorationPlugin)
    .use(codeHighlightPlugin)
    .use(codeBlockView)
    .use(remarkMathPlugin)
    .use(mathInlineSchema)
    .use(mathBlockSchema)
    .use(mathInlineView)
    .use(mathBlockView)
    // P4 smart-block runtime — shortcode leaf/container as real schema nodes that
    // round-trip byte-for-byte (docs/design/FORMATS.md).
    .use(remarkShortcode)
    .use(shortcodeLeafSchema)
    .use(shortcodeContainerSchema)
    .use(shortcodeLeafView)
    .use(shortcodeContainerView)
    // P4 GFM-visible coexistence — image alignment as a `<div align>` GitHub renders too.
    .use(remarkAligned)
    .use(alignedSchema)
    // Media coexistence — a sized image as `<img width>` GitHub renders too (after aligned so a
    // sized image inside a `<div align>` is lifted from the paired body).
    .use(remarkMedia)
    .use(mediaImageSchema)
    .use(mediaImageView)
    .use(bareImageView)
    // P5 `collapsible` — the native <details> GitHub folds too.
    .use(remarkDetails)
    .use(detailsSchema)
    .use(detailsView)
    // P5 `2col`/`3col` — the HTML-table coexistence form GitHub renders as real columns.
    .use(remarkColumns)
    .use(columnsSchema)
    .use(columnSchema)
    // Preserve YAML front matter as a real node (otherwise a leading `---` is mangled).
    .use(remarkFrontmatterPlugin)
    .use(frontmatterSchema)
    .use(frontmatterView)
    // Keep bare URLs bare on save (GFM autolink-literals would otherwise re-wrap as `<url>`).
    .use(remarkAutolinks)
    .use(autolinkSchema)
    .use(autolinkInputRule)
    // Reference-style links: `[label]: url` definitions and the `[ref]` / `[text][ref]` /
    // `![alt][ref]` forms that point at them (#33). Registered after the preset so `paragraph`
    // stays the schema's default block type.
    .use(remarkReferenceLinks)
    .use(definitionSchema)
    .use(linkReferenceSchema)
    .use(imageReferenceSchema)
    // `<br>` as a real line break that saves back byte-for-byte (remark transform registered
    // early, above; this is its schema node).
    .use(hardBreakSchema)
    // Preserve HTML entities (`&copy;`, `&nbsp;`, `&#35;`) byte-for-byte (remark transform is
    // registered early, above; this is its schema node).
    .use(entitySchema)
    // Underline / subscript / superscript as GitHub-visible raw HTML (`<u>`, `<sub>`, `<sup>`).
    .use(remarkInlineMarks)
    .use(underlineSchema)
    .use(subscriptSchema)
    .use(superscriptSchema)
    .use(kbdSchema)
    .use(markSchema)
    .use(sampSchema)
    .use(varSchema)
    .use(citeSchema)
    .use(smallSchema)
    // P3 interaction surfaces — shortcuts, cursor-state events, slash menu. All three
    // and the toolbar drive the one command registry (Principle 4).
    .use(historyPlugin)
    .use(historyKeymap)
    .use(omdKeymap)
    .use(stateEventsPlugin)
    .use(headingFoldPlugin)
    .use(escapedMdPlugin)
    .use(slashPlugin)
    // After the slash menu, so its Tab (select item) wins while the menu is open.
    .use(columnsKeymap)
    .use(contextMenuPlugin)
    .use(findReplacePlugin)
    .use(dragHandlePlugin)
    .use(tableControlsPlugin)
    .create();

  // A load's canonical form, in the SAME fixed-up bytes the markdownUpdated listener compares
  // against (`applySerializeFixups`) — not milkdown's raw serialization. Aligning them is what
  // makes the echo guard hold for content the fixups touch (wikilinks, `[!NOTE]` alerts): otherwise
  // `fixed !== lastEmitted`, the load echoes, and on an external revert it re-dirties the buffer (#14).
  const snapshot = () => applySerializeFixups(editor.action(getMarkdown()));

  // The editor loaded `initial` on create; record its canonical form so that first load's
  // debounced echo is recognised and never bounced back as an edit.
  lastEmitted = snapshot();

  // Expose the markdown parser + serializer so the AI block can turn a model's markdown answer
  // into document nodes and hand the whole document to the model as context (see blocks/md-bridge).
  setMdBridge({
    parse: (markdown) => editor.action((ctx) => ctx.get(parserCtx)(markdown)),
    serialize: snapshot
  });

  return {
    setMarkdown(markdown: string) {
      // Compare the incoming markdown against what the editor currently serializes to.
      // If they produce the same fixed-up output, skip dispatching entirely — this prevents
      // setMarkdown from resetting ProseMirror's history timer, which would chain separate
      // user edits into one undo step through a sequence of intermediate setMarkdown calls.
      // We compare at the serialization level (not ProseMirror doc.eq()) because Milkdown's
      // heading command and remark parser can produce structurally different docs that
      // serialize to identical markdown.
      const current = snapshot();
      if (applySerializeFixups(markdown) === current) return;

      // Apply the push as the narrowest edit that reaches it. `replaceAll` re-parses and
      // re-renders the whole document, tearing down every node view and dropping the
      // selection — on screen that is the "pasted back into place" flash of #7. Fall back
      // to it only if the markdown will not parse.
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const next = ctx.get(parserCtx)(markdown);
        if (!next) {
          editor.action(replaceAll(markdown));
          return;
        }
        const tr = view.state.tr;
        if (diffDocument(view.state.doc, next, tr)) view.dispatch(tr);
      });
      // Record the canonical form we now hold, so the debounced markdownUpdated this triggers
      // is recognised as a load — not a user edit — and never echoed back to the host (#14).
      lastEmitted = snapshot();
    },
    getMarkdown() {
      return applySerializeFixups(editor.action(getMarkdown()));
    },
    getView() {
      return editor.ctx.get(editorViewCtx);
    }
  };
}
