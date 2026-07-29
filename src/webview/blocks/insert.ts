import type { Schema } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { insertBlock, type OmdCommand } from '../commands/registry';
import { getBlocks } from './registry';
import { buildOpen, buildClose, stringifyParams } from '../../shared/shortcode';
import { resolveDateInput, formatDateToken } from './date';
import { insertFootnote } from './footnote';
import {
  parseYouTubeId,
  youTubeThumbnail,
  youTubeWatchUrl,
  parseImageList
} from './media';
import { openParamPopover } from '../ui/popover';
import { openParamPanel } from '../ui/param-panel';
import type { BlockDefinition } from '../../shared/blocks';
import {
  isHttpUrl,
  hostnameOf,
  linkcardParams,
  linkcardBody,
  requestLinkMeta,
  fillInsertedLinkcard
} from './linkcard';

/**
 * Shipped built-ins whose *native* on-disk form isn't a shortcode, so inserting them writes
 * plain GFM instead of machinery (Principle 1). `date` is the case in point: FORMATS.md fixes
 * its on-disk form as the bare `📅 YYYY-MM-DD` token, with relative input resolved on insert.
 */
/** Build an N-column block in its on-disk HTML-table form (docs/design/FORMATS.md). */
function insertColumns(count: number) {
  return insertBlock((state) => {
    const { columns, column, paragraph } = state.schema.nodes;
    const cells = Array.from({ length: count }, (_, i) =>
      column.create({ sepRaw: i === 0 ? '' : '</td><td>' }, paragraph.create())
    );
    return columns.create(
      { openRaw: '<table><tr><td>', closeRaw: '</td></tr></table>' },
      cells
    );
  });
}

/**
 * A tabs block is nested shortcode containers — one `tab` per panel, each carrying its label
 * as a param. Nesting already round-trips, so tabs need no new on-disk format.
 */
function insertTabs(labels: string[]) {
  return insertBlock((state) => {
    const { shortcode_container, paragraph } = state.schema.nodes;
    const panels = labels.map((label) => {
      const params = stringifyParams({ label });
      return shortcode_container.create(
        { name: 'tab', params, openRaw: buildOpen('tab', params), closeRaw: buildClose('tab') },
        paragraph.create()
      );
    });
    const params = stringifyParams({});
    return shortcode_container.create(
      { name: 'tabs', params, openRaw: buildOpen('tabs', params), closeRaw: buildClose('tabs') },
      panels
    );
  });
}

/**
 * A media container: the shortcode carries the params, the body carries real markdown so the
 * media is visible to a plain reader (docs/design/FORMATS.md).
 */
function mediaContainer(
  state: EditorState,
  name: string,
  params: Record<string, unknown>,
  body: import('prosemirror-model').Node[]
) {
  const p = stringifyParams(params);
  return state.schema.nodes.shortcode_container.create(
    { name, params: p, openRaw: buildOpen(name, p), closeRaw: buildClose(name) },
    body.length ? body : [state.schema.nodes.paragraph.create()]
  );
}

const BUILTIN_INSERTS: Record<string, (view: EditorView) => boolean> = {
  '2col': insertColumns(2),
  '3col': insertColumns(3),
  tabs: insertTabs(['First', 'Second']),
  footnote: insertFootnote,

  // Smart callout: a shortcode carrying icon/color around a blockquote whose first (bold) line is
  // the title. Title + body are ordinary editable content; icon/color edit via the property panel.
  callout: insertBlock((state) => {
    const { shortcode_container, blockquote, paragraph } = state.schema.nodes;
    const title = paragraph.create(null, state.schema.text('Title', [state.schema.marks.strong.create()]));
    const body = blockquote.create(null, [title, paragraph.create()]);
    const params = stringifyParams({ icon: 'info', color: '#4daafc' });
    return shortcode_container.create(
      { name: 'callout', params, openRaw: buildOpen('callout', params), closeRaw: buildClose('callout') },
      body
    );
  }),

  chart: insertBlock((state) => {
    // The starter body is a real GFM table — the chart's data *and* its GitHub fallback.
    const { table, table_row, table_header, table_cell, paragraph } = state.schema.nodes;
    const cell = (type: import('prosemirror-model').NodeType, text: string) =>
      type.create(null, paragraph.create(null, text ? state.schema.text(text) : undefined));
    const rows = [
      table_row.create(null, [
        cell(table_header, 'Label'),
        cell(table_header, 'Value')
      ]),
      table_row.create(null, [cell(table_cell, 'A'), cell(table_cell, '10')]),
      table_row.create(null, [cell(table_cell, 'B'), cell(table_cell, '20')]),
      table_row.create(null, [cell(table_cell, 'C'), cell(table_cell, '15')])
    ];
    return mediaContainer(state, 'chart', { type: 'bar', title: 'Chart' }, [
      table.create(null, rows)
    ]);
  }),

  youtube: (view) => {
    openParamPopover({
      anchor: view.coordsAtPos(view.state.selection.from),
      label: 'YouTube URL or video id',
      value: '',
      onCommit: (input) => {
        const id = parseYouTubeId(input);
        if (!id) return; // not a YouTube URL — write nothing rather than a broken embed
        insertBlock((state) => {
          // `[![…](thumbnail)](watch)` — a clickable thumbnail wherever markdown is rendered.
          const link = state.schema.marks.link.create({ href: youTubeWatchUrl(id) });
          const image = state.schema.nodes.image.create(
            { src: youTubeThumbnail(id), alt: 'Watch on YouTube' },
            undefined,
            [link]
          );
          return mediaContainer(state, 'youtube', { url: youTubeWatchUrl(id) }, [
            state.schema.nodes.paragraph.create(null, image)
          ]);
        })(view);
      }
    });
    return true;
  },

  gallery: (view) => {
    openParamPopover({
      anchor: view.coordsAtPos(view.state.selection.from),
      label: 'Image URLs — comma or newline separated',
      value: '',
      onCommit: (input) => {
        const urls = parseImageList(input);
        insertBlock((state) =>
          mediaContainer(
            state,
            'gallery',
            { count: urls.length },
            // One image per paragraph, so each is a grid item here and a real image on GitHub.
            urls.map((src, i) =>
              state.schema.nodes.paragraph.create(
                null,
                state.schema.nodes.image.create({ src, alt: `Image ${i + 1}` })
              )
            )
          )
        )(view);
      }
    });
    return true;
  },

  linkcard: (view) => {
    openParamPopover({
      anchor: view.coordsAtPos(view.state.selection.from),
      label: 'Link URL',
      value: '',
      onCommit: (input) => {
        const url = input.trim();
        if (!isHttpUrl(url)) return; // not a link — write nothing rather than a broken card
        // Insert immediately with a hostname placeholder so the card is visible at once; the real
        // title/description/image fill in when the host's fetch returns (explicit fetch on insert).
        const placeholder = hostnameOf(url) || url;
        insertBlock((state) =>
          mediaContainer(state, 'linkcard', linkcardParams(url, null), linkcardBody(state, url, placeholder))
        )(view);
        void requestLinkMeta(url).then((meta) => {
          if (meta) fillInsertedLinkcard(view, url, meta);
        });
      }
    });
    return true;
  },

  date: (view) => {
    openParamPopover({
      anchor: view.coordsAtPos(view.state.selection.from),
      label: 'Date — today, +7d, 2026-01-02',
      value: 'today',
      onCommit: (input) => {
        const iso = resolveDateInput(input);
        if (!iso) return; // unparseable input writes nothing rather than a wrong date
        const { from, to } = view.state.selection;
        view.dispatch(view.state.tr.insertText(formatDateToken(iso), from, to).scrollIntoView());
        view.focus();
      }
    });
    return true;
  }
};

/**
 * Turn the discovered block set into slash-menu insert commands (Principle 4 — the slash
 * menu is a thin front-end over commands, whether the command is built-in or a discovered
 * block). Inserting a block writes its *managed* shortcode: a leaf tag, or a container
 * wrapping an empty paragraph the writer fills in. The bytes come straight from the shared
 * shortcode builder, so what's inserted is exactly what round-trips (docs/design/FORMATS.md).
 */
/** Create a block's managed shortcode node with the given params object. */
function makeBlockNode(state: EditorState, def: BlockDefinition, params: Record<string, unknown>) {
  const p = stringifyParams(params);
  if (def.kind === 'leaf') {
    return state.schema.nodes.shortcode_leaf.create({
      name: def.name,
      params: p,
      raw: buildOpen(def.name, p)
    });
  }
  return state.schema.nodes.shortcode_container.create(
    { name: def.name, params: p, openRaw: buildOpen(def.name, p), closeRaw: buildClose(def.name) },
    state.schema.nodes.paragraph.create()
  );
}

/**
 * The insert `run` for a discovered block. If the block declares required params, it prompts
 * for them first (Phase carryover: required params on insert) — gating the Insert button until
 * they're filled — then inserts with the collected values. Otherwise it inserts immediately
 * with the defaults.
 */
function genericInsertRun(def: BlockDefinition): (view: EditorView) => boolean {
  return (view) => {
    const doInsert = (params: Record<string, unknown>) =>
      insertBlock((state) => makeBlockNode(state, def, params))(view);

    const requiredDefs = (def.params ?? []).filter((p) => p.required);
    const defaults = def.defaultParams ?? {};
    if (requiredDefs.length === 0) {
      doInsert(defaults);
      return true;
    }

    const fields = (def.params ?? []).map((p) => ({
      name: p.name,
      label: p.label ?? p.name,
      type: p.type,
      value: (defaults[p.name] ?? p.default) as unknown,
      options: p.options
    }));
    const c = view.coordsAtPos(view.state.selection.from);
    openParamPanel({
      title: def.title,
      icon: def.icon,
      fields,
      anchor: { left: c.left, top: c.top, bottom: c.bottom },
      requiredFields: requiredDefs.map((p) => p.name),
      applyLabel: 'Insert',
      onApply: (values) => doInsert({ ...defaults, ...values })
    });
    return true;
  };
}

export function blockInsertCommands(schema: Schema): OmdCommand[] {
  const { shortcode_leaf, shortcode_container } = schema.nodes;
  if (!shortcode_leaf || !shortcode_container) return [];

  return getBlocks().map((def) => ({
    id: `block-${def.name}`,
    title: def.title,
    icon: def.icon,
    insert: true,
    group: def.group ?? 'Blocks',
    keywords: def.keywords,
    run: BUILTIN_INSERTS[def.name] ?? genericInsertRun(def)
  }));
}
