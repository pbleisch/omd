import * as vscode from 'vscode';
import * as os from 'os';

/**
 * Who authored a comment. OMD stores comments in Git, so the most correct identity is the one
 * that will attribute the commit anyway: `git user.name`. We resolve it with a layered
 * fallback that never prompts —
 *
 *   git user.name  →  an existing (silent) GitHub session  →  the OS user  →  "you"
 *
 * A real sign-in is reserved for the features that genuinely need the GitHub API (the
 * `@mention` contributor picker), not for merely labelling a comment.
 */

/** The document's repository, if the built-in Git extension knows one for it. */
export async function repositoryFor(
  document: vscode.TextDocument
): Promise<GitRepository | undefined> {
  const ext = vscode.extensions.getExtension<GitExtension>('vscode.git');
  if (!ext) return undefined;
  const gitExt = ext.isActive ? ext.exports : await ext.activate();
  const api = gitExt.getAPI(1);
  // Prefer the repo whose root contains the document; otherwise any open repo will do for
  // reading the (usually global) user.name.
  const path = document.uri.fsPath;
  return (
    api.repositories.find((r) => path.startsWith(r.rootUri.fsPath)) ?? api.repositories[0]
  );
}

async function gitUserName(document: vscode.TextDocument): Promise<string | undefined> {
  try {
    const repo = await repositoryFor(document);
    if (!repo) return undefined;
    // Local overrides global, the same order git itself resolves in.
    const local = await repo.getConfig('user.name').catch(() => undefined);
    if (local) return local;
    const global = await repo.getGlobalConfig('user.name').catch(() => undefined);
    return global || undefined;
  } catch {
    return undefined;
  }
}

async function githubLabel(): Promise<string | undefined> {
  try {
    // `silent` guarantees no sign-in UI: an existing session or nothing.
    const session = await vscode.authentication.getSession('github', [], { silent: true });
    return session?.account.label || undefined;
  } catch {
    return undefined;
  }
}

function osUser(): string | undefined {
  try {
    return os.userInfo().username || undefined;
  } catch {
    return undefined;
  }
}

/** Resolve the comment author for this document; always returns something. */
export async function resolveAuthor(
  document: vscode.TextDocument,
  log: vscode.OutputChannel
): Promise<string> {
  const author = (await gitUserName(document)) ?? (await githubLabel()) ?? osUser() ?? 'you';
  log.appendLine(`[identity] comment author resolved to "${author}"`);
  return author;
}

// Minimal shapes of the built-in Git extension API (typed here to avoid a dependency on it).
interface GitExtension {
  getAPI(version: 1): GitApi;
}
interface GitApi {
  repositories: GitRepository[];
}
export interface GitRepository {
  rootUri: vscode.Uri;
  getConfig(key: string): Promise<string>;
  getGlobalConfig(key: string): Promise<string>;
  state: { remotes: Array<{ name: string; fetchUrl?: string; pushUrl?: string }> };
}
