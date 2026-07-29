import { toggleMark, setBlockType, wrapIn, chainCommands } from 'prosemirror-commands';
import { wrapInList } from 'prosemirror-schema-list';
import { undo, redo } from 'prosemirror-history';
import type { Command as PMCommand, EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { MarkType, NodeType } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import { openParamPopover } from '../ui/popover';
import { documentHeadings } from '../blocks/anchors';
import { insertFootnote } from '../blocks/footnote';
import { openFind } from '../plugins/find/find-plugin';

/**
 * The one command layer. Principle 4 — every capability reachable from the toolbar, a
 * shortcut, and the slash menu, all driving the *same* code. The toolbar and slash menu
 * are thin front-ends over this list; the keymap binds the same `run`s. Nothing here
 * splices literal characters — each command is a real transform on the document
 * (Principle 3).
 */
export interface OmdCommand {
  id: string;
  title: string;
  /** Codicon name for the toolbar (chrome is codicons, never emoji — docs/design/STYLE.md). */
  icon?: string;
  /** Short text label used when there's no good icon (e.g. H1). */
  label?: string;
  /** Human-readable shortcut, shown in menus. */
  shortcut?: string;
  /** ProseMirror keymap binding, e.g. "Mod-b". */
  key?: string;
  /** Runs the command against the live view. */
  run: (view: EditorView) => boolean;
  /** Toolbar highlight: is this mark/block active at the cursor? */
  isActive?: (state: EditorState) => boolean;
  /** Appears in the slash menu. */
  insert?: boolean;
  /** Extra search terms for the slash menu. */
  keywords?: string[];
  /** Slash-menu group heading. */
  group?: string;
}

function markActive(state: EditorState, type: MarkType): boolean {
  const { from, $from, to, empty } = state.selection;
  if (empty) return !!type.isInSet(state.storedMarks || $from.marks());
  return state.doc.rangeHasMark(from, to, type);
}

function blockActive(state: EditorState, type: NodeType, attrs?: Record<string, unknown>): boolean {
  const { $from, to } = state.selection;
  if (to > $from.end()) return false;
  const node = $from.node($from.depth);
  if (node.type !== type) return false;
  if (!attrs) return true;
  return Object.entries(attrs).every(([k, v]) => node.attrs[k] === v);
}

/** Wrap a ProseMirror command so it dispatches against the view and refocuses. */
function fromPM(cmd: PMCommand): (view: EditorView) => boolean {
  return (view) => {
    const ok = cmd(view.state, view.dispatch, view);
    view.focus();
    return ok;
  };
}

/** Replace the current (empty) block with a fresh node, or insert one below. */
export function insertBlock(make: (state: EditorState) => import('prosemirror-model').Node) {
  return (view: EditorView): boolean => {
    const { state } = view;
    const node = make(state);
    const { $from } = state.selection;
    const atEmptyBlock = $from.parent.content.size === 0;
    let tr = state.tr;
    if (atEmptyBlock) {
      const from = $from.before($from.depth);
      const to = $from.after($from.depth);
      tr = tr.replaceRangeWith(from, to, node);
      tr = tr.setSelection(TextSelection.near(tr.doc.resolve(from + 1)));
    } else {
      const pos = $from.after($from.depth);
      tr = tr.insert(pos, node);
      tr = tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)));
    }
    view.dispatch(tr.scrollIntoView());
    view.focus();
    return true;
  };
}

/** Is the cursor inside a list item that is a GFM task (has a `checked` attr)? */
function taskActive(state: EditorState): boolean {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === 'list_item') return node.attrs.checked != null;
  }
  return false;
}

/**
 * Turn the current block into a GFM task list: wrap it in a bullet list (unless it already
 * is one), then stamp `checked = false` on the list items in the selection so the GFM
 * serializer writes `- [ ]`. Toggling checkboxes on/off is the task-lists plugin's job.
 */
function insertTaskList(view: EditorView): boolean {
  const { bullet_list: bullet, list_item: listItem } = view.state.schema.nodes;
  if (!bullet || !listItem) return false;

  const { $from } = view.state.selection;
  let inList = false;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type === listItem) {
      inList = true;
      break;
    }
  }
  if (!inList && !wrapInList(bullet)(view.state, view.dispatch, view)) return false;

  const { state } = view;
  const { from, to } = state.selection;
  let tr = state.tr;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type === listItem && node.attrs.checked == null) {
      tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: false });
    }
  });
  if (tr.docChanged) view.dispatch(tr);
  view.focus();
  return true;
}

/** The contiguous range around the cursor covered by `link`, or the selection if non-empty. */
function linkRange(state: EditorState, linkType: MarkType): { from: number; to: number } | null {
  const { $from, from, to, empty } = state.selection;
  if (!empty) return { from, to };
  if (!linkType.isInSet($from.marks())) return null;
  let start = from;
  let end = to;
  const blockStart = $from.start();
  const blockEnd = $from.end();
  while (start > blockStart && state.doc.rangeHasMark(start - 1, start, linkType)) start--;
  while (end < blockEnd && state.doc.rangeHasMark(end, end + 1, linkType)) end++;
  return { from: start, to: end };
}

/** Prompt for a URL and apply the `link` mark (or unlink when the cursor is in a link). */
function toggleLink(view: EditorView): boolean {
  const linkType = view.state.schema.marks.link;
  if (!linkType) return false;
  if (markActive(view.state, linkType)) {
    const range = linkRange(view.state, linkType);
    if (range) view.dispatch(view.state.tr.removeMark(range.from, range.to, linkType));
    view.focus();
    return true;
  }
  const { from, to, empty } = view.state.selection;
  openParamPopover({
    anchor: view.coordsAtPos(from),
    label: 'Link URL',
    value: '',
    // When the URL starts with `#`, suggest the document's heading anchors (GitHub-style slugs).
    suggest: (value) => {
      if (!value.startsWith('#')) return [];
      const q = value.slice(1).toLowerCase();
      return documentHeadings(view.state.doc)
        .filter((h) => q === '' || h.slug.includes(q) || h.text.toLowerCase().includes(q))
        .slice(0, 8)
        .map((h) => ({ label: h.text, detail: `#${h.slug}`, value: `#${h.slug}` }));
    },
    onCommit: (href) => {
      if (!href) return;
      const s = view.state;
      if (empty) {
        const text = s.schema.text(href, [linkType.create({ href })]);
        view.dispatch(s.tr.insert(from, text));
      } else {
        view.dispatch(s.tr.addMark(from, to, linkType.create({ href })));
      }
      view.focus();
    }
  });
  return true;
}

/** Prompt for a URL and insert an image node at the cursor. */
function insertImage(view: EditorView): boolean {
  const imageType = view.state.schema.nodes.image;
  if (!imageType) return false;
  openParamPopover({
    anchor: view.coordsAtPos(view.state.selection.from),
    label: 'Image URL',
    value: '',
    onCommit: (src) => {
      if (!src) return;
      const s = view.state;
      view.dispatch(s.tr.replaceSelectionWith(imageType.create({ src, alt: '' }), false));
      view.focus();
    }
  });
  return true;
}

export function buildCommands(schema: import('prosemirror-model').Schema): OmdCommand[] {
  const marks = schema.marks;
  const nodes = schema.nodes;

  const cmds: OmdCommand[] = [];

  // --- Inline marks ---
  cmds.push(
    {
      id: 'bold',
      title: 'Bold',
      icon: 'bold',
      shortcut: 'Mod+B',
      key: 'Mod-b',
      run: fromPM(toggleMark(marks.strong)),
      isActive: (s) => markActive(s, marks.strong)
    },
    {
      id: 'italic',
      title: 'Italic',
      icon: 'italic',
      shortcut: 'Mod+I',
      key: 'Mod-i',
      run: fromPM(toggleMark(marks.emphasis)),
      isActive: (s) => markActive(s, marks.emphasis)
    },
    {
      id: 'code',
      title: 'Inline code',
      icon: 'code',
      shortcut: 'Mod+E',
      key: 'Mod-e',
      run: fromPM(toggleMark(marks.inlineCode)),
      isActive: (s) => markActive(s, marks.inlineCode)
    }
  );
  if (marks.strike_through) {
    cmds.push({
      id: 'strike',
      title: 'Strikethrough',
      icon: 'chrome-minimize',
      shortcut: 'Mod+Shift+X',
      key: 'Mod-Shift-x',
      run: fromPM(toggleMark(marks.strike_through)),
      isActive: (s) => markActive(s, marks.strike_through)
    });
  }
  if (marks.underline) {
    cmds.push({
      id: 'underline',
      title: 'Underline',
      label: 'U',
      shortcut: 'Mod+U',
      key: 'Mod-u',
      run: fromPM(toggleMark(marks.underline)),
      isActive: (s) => markActive(s, marks.underline)
    });
  }
  if (marks.subscript) {
    cmds.push({
      id: 'subscript',
      title: 'Subscript',
      label: 'X₂',
      run: fromPM(toggleMark(marks.subscript)),
      isActive: (s) => markActive(s, marks.subscript)
    });
  }
  if (marks.superscript) {
    cmds.push({
      id: 'superscript',
      title: 'Superscript',
      label: 'X²',
      run: fromPM(toggleMark(marks.superscript)),
      isActive: (s) => markActive(s, marks.superscript)
    });
  }

  // --- Headings (toggle back to paragraph when already active) ---
  for (const level of [1, 2, 3] as const) {
    cmds.push({
      id: `h${level}`,
      title: `Heading ${level}`,
      label: `H${level}`,
      shortcut: `Mod+Alt+${level}`,
      key: `Mod-Alt-${level}`,
      insert: true,
      group: 'Headings',
      keywords: ['heading', 'title', `h${level}`],
      isActive: (s) => blockActive(s, nodes.heading, { level }),
      run: fromPM(
        chainCommands(
          (state, dispatch, view) =>
            blockActive(state, nodes.heading, { level })
              ? setBlockType(nodes.paragraph)(state, dispatch, view)
              : false,
          setBlockType(nodes.heading, { level })
        )
      )
    });
  }

  // --- Blocks ---
  cmds.push(
    {
      id: 'quote',
      title: 'Quote',
      icon: 'quote',
      shortcut: 'Mod+Shift+.',
      key: 'Mod-Shift-.',
      insert: true,
      group: 'Blocks',
      run: fromPM(wrapIn(nodes.blockquote)),
      isActive: (s) => blockActive(s, nodes.blockquote)
    },
    {
      id: 'bullet-list',
      title: 'Bullet list',
      icon: 'list-unordered',
      shortcut: 'Mod+Shift+8',
      key: 'Mod-Shift-8',
      insert: true,
      group: 'Blocks',
      run: fromPM(wrapInList(nodes.bullet_list))
    },
    {
      id: 'ordered-list',
      title: 'Numbered list',
      icon: 'list-ordered',
      shortcut: 'Mod+Shift+7',
      key: 'Mod-Shift-7',
      insert: true,
      group: 'Blocks',
      run: fromPM(wrapInList(nodes.ordered_list))
    },
    {
      id: 'code-block',
      title: 'Code block',
      icon: 'symbol-namespace',
      insert: true,
      group: 'Blocks',
      keywords: ['fence', 'pre', 'snippet'],
      run: insertBlock((s) => s.schema.nodes.code_block.createAndFill({ language: 'ts' })!)
    },
    {
      id: 'divider',
      title: 'Divider',
      icon: 'dash',
      insert: true,
      group: 'Blocks',
      keywords: ['hr', 'rule', 'separator'],
      run: insertBlock((s) => s.schema.nodes.hr.create())
    }
  );

  /**
   * Insert a GFM alert as a blockquote with the marker line *and* an empty body paragraph, then
   * drop the cursor in the body — so you can type immediately (the marker line is chrome, hidden
   * by the callout decoration).
   */
  function insertCallout(kind: string): (view: EditorView) => boolean {
    return (view) => {
      const { state } = view;
      const { paragraph, blockquote } = state.schema.nodes;
      const marker = paragraph.create(null, state.schema.text(`[!${kind.toUpperCase()}]`));
      const node = blockquote.create(null, [marker, paragraph.create()]);
      const { $from } = state.selection;
      const atEmpty = $from.parent.content.size === 0;
      let tr = state.tr;
      let at: number;
      if (atEmpty) {
        at = $from.before($from.depth);
        tr = tr.replaceRangeWith(at, $from.after($from.depth), node);
      } else {
        at = $from.after($from.depth);
        tr = tr.insert(at, node);
      }
      // Body paragraph content = blockquote-open(1) + marker paragraph + body-open(1).
      const bodyContent = at + 1 + marker.nodeSize + 1;
      tr = tr.setSelection(TextSelection.near(tr.doc.resolve(bodyContent)));
      view.dispatch(tr.scrollIntoView());
      view.focus();
      return true;
    };
  }

  // --- Callouts (native GitHub alerts) ---
  const CALLOUTS: Array<[string, string, string]> = [
    ['note', 'Note', 'info'],
    ['tip', 'Tip', 'light-bulb'],
    ['important', 'Important', 'megaphone'],
    ['warning', 'Warning', 'warning'],
    ['caution', 'Caution', 'error']
  ];
  for (const [kind, label, icon] of CALLOUTS) {
    cmds.push({
      id: `callout-${kind}`,
      title: `${label} callout`,
      icon,
      insert: true,
      group: 'Callouts',
      keywords: ['callout', 'alert', 'admonition', kind],
      run: insertCallout(kind)
    });
  }

  // --- Rich blocks ---
  cmds.push(
    {
      id: 'mermaid',
      title: 'Diagram (Mermaid)',
      icon: 'type-hierarchy',
      insert: true,
      group: 'Rich',
      keywords: ['mermaid', 'diagram', 'flowchart', 'graph'],
      run: insertBlock((s) =>
        s.schema.nodes.code_block.createAndFill(
          { language: 'mermaid' },
          s.schema.text('graph TD\n  A --> B')
        )!
      )
    },
    {
      id: 'math',
      title: 'Math block',
      icon: 'symbol-operator',
      insert: true,
      group: 'Rich',
      keywords: ['math', 'latex', 'equation', 'katex'],
      run: insertBlock((s) => s.schema.nodes.math_block.create({ value: 'x^2 + y^2 = z^2' }))
    }
  );
  if (nodes.table) {
    cmds.push({
      id: 'table',
      title: 'Table',
      icon: 'table',
      insert: true,
      group: 'Rich',
      keywords: ['table', 'grid'],
      run: insertBlock((s) => {
        const { table, table_row, table_header, table_cell, paragraph } = s.schema.nodes;
        const cell = (type: NodeType, text: string) =>
          type.create(null, paragraph.create(null, text ? s.schema.text(text) : undefined));
        const header = table_row.create(null, [
          cell(table_header, 'Column A'),
          cell(table_header, 'Column B')
        ]);
        const row = table_row.create(null, [cell(table_cell, ''), cell(table_cell, '')]);
        return table.create(null, [header, row]);
      })
    });
  }

  // --- History (toolbar only; the history keymap already binds Mod-Z / Mod-Y) ---
  cmds.push(
    {
      id: 'undo',
      title: 'Undo',
      icon: 'discard',
      shortcut: 'Mod+Z',
      run: fromPM(undo)
    },
    {
      id: 'redo',
      title: 'Redo',
      icon: 'redo',
      shortcut: 'Mod+Shift+Z',
      run: fromPM(redo)
    }
  );

  // --- Inline actions ---
  if (marks.link) {
    cmds.push({
      id: 'link',
      title: 'Link',
      icon: 'link',
      shortcut: 'Mod+K',
      key: 'Mod-k',
      run: toggleLink,
      isActive: (s) => markActive(s, marks.link)
    });
  }
  if (nodes.image) {
    cmds.push({
      id: 'image',
      title: 'Image',
      icon: 'file-media',
      insert: true,
      group: 'Media',
      keywords: ['image', 'picture', 'photo', 'img'],
      run: insertImage
    });
  }

  // --- Task list ---
  if (nodes.bullet_list && nodes.list_item) {
    cmds.push({
      id: 'task-list',
      title: 'Task list',
      icon: 'tasklist',
      insert: true,
      group: 'Blocks',
      keywords: ['task', 'todo', 'checklist', 'checkbox'],
      run: insertTaskList,
      isActive: taskActive
    });
  }

  // --- Footnote (toolbar only; the slash menu offers it via the shipped `footnote` block) ---
  if (nodes.footnote_reference) {
    cmds.push({
      id: 'footnote',
      title: 'Footnote',
      icon: 'references',
      run: (view) => insertFootnote(view)
    });
  }

  // --- Find & Replace (toolbar only; the plugin owns Mod-F and the bar) ---
  cmds.push({
    id: 'find',
    title: 'Find & replace',
    icon: 'search',
    shortcut: 'Mod+F',
    run: (view) => {
      openFind(view);
      return true;
    }
  });

  return cmds;
}
