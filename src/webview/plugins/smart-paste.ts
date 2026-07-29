import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { EditorState } from 'prosemirror-state';
import type { NodeType } from 'prosemirror-model';
import { insertBlock } from '../commands/registry';
import { buildOpen, buildClose, stringifyParams } from '../../shared/shortcode';
import { parseYouTubeId, youTubeThumbnail, youTubeWatchUrl } from '../blocks/media';

/**
 * Smart paste. ProseMirror already turns pasted *HTML* into rich nodes (so
 * "HTML → GFM" comes for free), so this intercepts only the two cases it would otherwise drop
 * to plain text:
 *
 *   - spreadsheet cells (tab-separated text) → a GFM table
 *   - a bare URL → a link, or a YouTube embed if it is one
 *
 * The detection is pure and conservative — a normal paste with no tabs and no lone URL falls
 * straight through to ProseMirror's own handling.
 */

/** Parse tab-separated clipboard text into a rectangular grid, or null if it isn't one. */
export function parseTsv(text: string): string[][] | null {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
  if (lines.length < 2) return null; // a single line is too ambiguous to treat as a table
  if (!lines.every((l) => l.includes('\t'))) return null;
  const grid = lines.map((l) => l.split('\t'));
  const cols = grid[0].length;
  if (cols < 2) return null;
  if (!grid.every((r) => r.length === cols)) return null; // ragged → not a clean grid
  return grid;
}

/** A single http(s) URL with no surrounding whitespace, or null. */
export function singleUrl(text: string): string | null {
  const t = text.trim();
  if (!t || /\s/.test(t)) return null;
  try {
    const u = new URL(t);
    return u.protocol === 'http:' || u.protocol === 'https:' ? t : null;
  } catch {
    return null;
  }
}

/** Build a table node from a grid — first row is the header. */
function tableNode(state: EditorState, grid: string[][]) {
  const { table, table_row, table_header, table_cell, paragraph } = state.schema.nodes;
  const cell = (type: NodeType, text: string) =>
    type.create(null, paragraph.create(null, text ? state.schema.text(text) : undefined));
  const rows = grid.map((cells, i) =>
    table_row.create(
      null,
      cells.map((c) => cell(i === 0 ? table_header : table_cell, c.trim()))
    )
  );
  return table.create(null, rows);
}

/** The YouTube embed block, its body a clickable thumbnail (the media coexistence form). */
function youtubeNode(state: EditorState, id: string) {
  const { shortcode_container, paragraph, image } = state.schema.nodes;
  const link = state.schema.marks.link.create({ href: youTubeWatchUrl(id) });
  const img = image.create({ src: youTubeThumbnail(id), alt: 'Watch on YouTube' }, undefined, [link]);
  const params = stringifyParams({ url: youTubeWatchUrl(id) });
  return shortcode_container.create(
    { name: 'youtube', params, openRaw: buildOpen('youtube', params), closeRaw: buildClose('youtube') },
    paragraph.create(null, img)
  );
}

function handleUrl(view: EditorView, url: string): boolean {
  const { state } = view;
  const id = parseYouTubeId(url);
  if (id && state.schema.nodes.shortcode_container && state.schema.nodes.image) {
    return insertBlock((s) => youtubeNode(s, id))(view);
  }
  const link = state.schema.marks.link;
  if (!link) return false;

  const { from, to, empty } = state.selection;
  if (!empty) {
    // Turn the selected text into a link — the most useful thing when text is selected.
    view.dispatch(state.tr.addMark(from, to, link.create({ href: url })));
    view.focus();
    return true;
  }
  // Nothing selected: drop the URL in as a link to itself.
  const tr = state.tr.insertText(url, from, to);
  tr.addMark(from, from + url.length, link.create({ href: url }));
  view.dispatch(tr);
  view.focus();
  return true;
}

const key = new PluginKey('omd-smart-paste');

export const smartPastePlugin = $prose(
  () =>
    new Plugin({
      key,
      props: {
        handlePaste(view, event) {
          const text = event.clipboardData?.getData('text/plain') ?? '';
          if (!text) return false;

          const grid = parseTsv(text);
          if (grid && view.state.schema.nodes.table) {
            return insertBlock((s) => tableNode(s, grid))(view);
          }
          const url = singleUrl(text);
          if (url) return handleUrl(view, url);

          return false; // everything else: ProseMirror's own paste (incl. rich HTML)
        }
      }
    })
);
