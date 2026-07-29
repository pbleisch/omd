import * as vscode from 'vscode';
import * as os from 'os';
import {
  parseBlockManifest,
  resolveBlocks,
  SHIPPED_BLOCKS,
  type BlockDefinition,
  type BlockSource
} from '../shared/blocks';

/**
 * Three-layer block discovery (docs/design/ARCHITECTURE.md, "Block discovery"): scan the
 * workspace and the user's home directory for block manifests, then resolve them against
 * the shipped built-ins (first match wins). This is the thin filesystem glue; the
 * resolution rule and the definition shape live in the shared, tested block model.
 *
 * A block is a directory under `.omd/blocks/<name>/` containing `block.json`. Malformed
 * manifests are skipped with a log line, never allowed to break discovery.
 */

const WORKSPACE_BLOCKS = '.omd/blocks';
const USER_BLOCKS = '.omd/blocks';

/** Read a file to a string, or undefined if it is absent. */
async function readOptional(uri: vscode.Uri): Promise<string | undefined> {
  try {
    return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
  } catch {
    return undefined;
  }
}

async function readLayer(
  root: vscode.Uri,
  source: BlockSource,
  log: vscode.OutputChannel
): Promise<BlockDefinition[]> {
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(root);
  } catch {
    return []; // directory absent — a normal, silent case
  }
  const defs: BlockDefinition[] = [];
  for (const [dir, type] of entries) {
    if (type !== vscode.FileType.Directory) continue;
    const manifestUri = vscode.Uri.joinPath(root, dir, 'block.json');
    try {
      const bytes = await vscode.workspace.fs.readFile(manifestUri);
      const manifest = JSON.parse(Buffer.from(bytes).toString('utf8')) as Record<string, unknown>;
      // An author render.js beside the manifest is the block's sandboxed code; loading it
      // here forces the block to the sandboxed tier (parseBlockManifest enforces that a
      // discovered script never runs with editor privileges).
      const script = await readOptional(vscode.Uri.joinPath(root, dir, 'render.js'));
      if (script !== undefined) manifest.script = script;
      const parsed = parseBlockManifest(manifest, source);
      if (parsed) defs.push(parsed);
      else log.appendLine(`[blocks] skipped invalid manifest: ${manifestUri.fsPath}`);
    } catch (err) {
      log.appendLine(`[blocks] skipped unreadable manifest ${manifestUri.fsPath}: ${String(err)}`);
    }
  }
  return defs;
}

/** Discover and resolve the full block set for the given document's workspace. */
export async function discoverBlocks(
  document: vscode.TextDocument,
  log: vscode.OutputChannel
): Promise<BlockDefinition[]> {
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  const workspace = folder
    ? await readLayer(vscode.Uri.joinPath(folder.uri, WORKSPACE_BLOCKS), 'workspace', log)
    : [];
  const user = await readLayer(
    vscode.Uri.joinPath(vscode.Uri.file(os.homedir()), USER_BLOCKS),
    'user',
    log
  );
  const resolved = resolveBlocks(workspace, user, SHIPPED_BLOCKS);
  log.appendLine(
    `[blocks] resolved ${resolved.length} (workspace ${workspace.length}, user ${user.length}, shipped ${SHIPPED_BLOCKS.length})`
  );
  return resolved;
}
