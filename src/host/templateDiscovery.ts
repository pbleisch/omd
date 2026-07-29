import * as vscode from 'vscode';
import * as os from 'os';
import {
  parseTemplateFile,
  resolveTemplates,
  SHIPPED_TEMPLATES,
  type TemplateDefinition,
  type TemplateSource
} from '../shared/templates';

/**
 * Three-layer template discovery — the same shape as block discovery. A template is a markdown
 * file directly under `.omd/templates/` (workspace) or `~/.omd/templates/` (user); the file
 * name is the template name. The shared model does the parsing and the first-match-wins
 * resolution, so this is only the filesystem glue.
 */

const TEMPLATES_DIR = '.omd/templates';

async function readLayer(
  root: vscode.Uri,
  source: TemplateSource,
  log: vscode.OutputChannel
): Promise<TemplateDefinition[]> {
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(root);
  } catch {
    return []; // directory absent — normal
  }
  const defs: TemplateDefinition[] = [];
  for (const [file, type] of entries) {
    if (type !== vscode.FileType.File || !file.endsWith('.md')) continue;
    const name = file.replace(/\.md$/i, '');
    try {
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(root, file));
      const def = parseTemplateFile(name, Buffer.from(bytes).toString('utf8'), source);
      if (def) defs.push(def);
      else log.appendLine(`[templates] skipped invalid template name: ${file}`);
    } catch (err) {
      log.appendLine(`[templates] skipped unreadable template ${file}: ${String(err)}`);
    }
  }
  return defs;
}

export async function discoverTemplates(
  document: vscode.TextDocument | undefined,
  log: vscode.OutputChannel
): Promise<TemplateDefinition[]> {
  const folder = document
    ? vscode.workspace.getWorkspaceFolder(document.uri)
    : vscode.workspace.workspaceFolders?.[0];
  const workspace = folder
    ? await readLayer(vscode.Uri.joinPath(folder.uri, TEMPLATES_DIR), 'workspace', log)
    : [];
  const user = await readLayer(
    vscode.Uri.joinPath(vscode.Uri.file(os.homedir()), TEMPLATES_DIR),
    'user',
    log
  );
  const resolved = resolveTemplates(workspace, user, SHIPPED_TEMPLATES);
  log.appendLine(
    `[templates] resolved ${resolved.length} (workspace ${workspace.length}, user ${user.length}, shipped ${SHIPPED_TEMPLATES.length})`
  );
  return resolved;
}
