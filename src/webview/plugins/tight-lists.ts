import { bulletListSchema } from '@milkdown/preset-commonmark';
import { extendListItemSchemaForTask } from '@milkdown/preset-gfm';

/**
 * Fix list round-trip fidelity. Milkdown's `bullet_list` and `list_item` schemas store
 * their `spread` flag as the string `"true"`/`"false"`, and remark-stringify treats the
 * string `"false"` as truthy — so lists serialized loose (blank lines between items and
 * before a nested list) even when the source was tight. `ordered_list` already emits a
 * real boolean, so only these two need correcting.
 *
 * We convert `spread` to a faithful boolean, so a tight list stays tight and a genuinely
 * loose one stays loose — the honest fix for Principle 2, not a force-tight shortcut.
 * The `list_item` override extends the GFM task schema (not the CommonMark base) so it
 * keeps the `checked` attr and task-list checkboxes still round-trip.
 */

function toBool(raw: unknown): boolean {
  return raw === true || raw === 'true';
}

export const tightBulletList = bulletListSchema.extendSchema((prev) => (ctx) => {
  const base = prev(ctx);
  return {
    ...base,
    toMarkdown: {
      match: (node) => node.type.name === 'bullet_list',
      runner: (state, node) => {
        state.openNode('list', undefined, { ordered: false, spread: toBool(node.attrs.spread) });
        state.next(node.content);
        state.closeNode();
      }
    }
  };
});

export const tightListItem = extendListItemSchemaForTask.extendSchema((prev) => (ctx) => {
  const base = prev(ctx);
  return {
    ...base,
    toMarkdown: {
      match: (node) => node.type.name === 'list_item',
      runner: (state, node) => {
        const spread = toBool(node.attrs.spread);
        const checked = node.attrs.checked;
        if (checked == null) {
          state.openNode('listItem', undefined, { spread });
        } else {
          state.openNode('listItem', undefined, {
            label: node.attrs.label,
            listType: node.attrs.listType,
            spread,
            checked
          });
        }
        state.next(node.content);
        state.closeNode();
      }
    }
  };
});
