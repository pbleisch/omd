import { SHIPPED_BLOCKS, type BlockDefinition } from '../../shared/blocks';

/**
 * The editor's live view of the resolved smart-block set. The slash menu reads it to offer
 * blocks, and the shortcode NodeView reads it for a block's title and icon.
 *
 * It's **seeded with the shipped built-ins** so a block's chrome (icon/title) is correct from the
 * very first render — the host sends its `setDocument` before the async `blocks` discovery
 * completes, so without a seed a shipped block like `youtube` would briefly fall back to the
 * `symbol-namespace` icon (which reads as literal `{}`) and never recover. The host's `blocks`
 * message (which includes the shipped set plus any discovered blocks) then replaces this whole.
 */
let blocks: BlockDefinition[] = [...SHIPPED_BLOCKS];
const byName = new Map<string, BlockDefinition>(SHIPPED_BLOCKS.map((def) => [def.name, def]));
type Listener = () => void;
const listeners = new Set<Listener>();

export function setBlocks(next: BlockDefinition[]): void {
  blocks = next;
  byName.clear();
  for (const def of next) byName.set(def.name, def);
  listeners.forEach((fn) => fn());
}

export function getBlocks(): BlockDefinition[] {
  return blocks;
}

export function getBlock(name: string): BlockDefinition | undefined {
  return byName.get(name);
}

/** Subscribe to registry replacements (e.g. to refresh chrome); returns an unsubscribe. */
export function onBlocksChanged(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
