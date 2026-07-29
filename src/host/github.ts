import * as vscode from 'vscode';
import {
  parseGitHubRemote,
  parseContributors,
  parseIssues,
  type GitHubData
} from '../shared/github';
import { repositoryFor } from './identity';

/**
 * GitHub data for the current document's repo: the contributor list that feeds
 * the `@mention` picker and the open issues that feed `#references`. This is the *one* place a
 * real GitHub sign-in is warranted, because it needs the API — everywhere else OMD stays
 * silent. `interactive` controls that: on open we only fetch if a session already exists;
 * the "Connect GitHub" command signs in.
 */

/** The `owner/repo` of the document's GitHub remote, if it has one. */
export async function githubSlug(
  document: vscode.TextDocument
): Promise<{ owner: string; repo: string } | null> {
  const repo = await repositoryFor(document);
  if (!repo) return null;
  for (const remote of repo.state.remotes) {
    const url = remote.fetchUrl || remote.pushUrl;
    const slug = url ? parseGitHubRemote(url) : null;
    if (slug) return slug;
  }
  return null;
}

async function getJson(url: string, token: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${url}`);
  return res.json();
}

export async function fetchGitHubData(
  document: vscode.TextDocument,
  log: vscode.OutputChannel,
  interactive: boolean
): Promise<GitHubData | null> {
  const slug = await githubSlug(document);
  if (!slug) {
    if (interactive) void vscode.window.showInformationMessage('OMD: this workspace has no GitHub remote.');
    return null;
  }

  // `createIfNone` prompts a sign-in; `silent` never does. On open we pass neither-interactive
  // so an existing session is reused and nothing pops up.
  const session = await vscode.authentication.getSession('github', ['repo'], {
    createIfNone: interactive,
    silent: !interactive
  });
  if (!session) return null;

  const base = `https://api.github.com/repos/${slug.owner}/${slug.repo}`;
  try {
    const [contribJson, issuesJson] = await Promise.all([
      getJson(`${base}/contributors?per_page=100`, session.accessToken).catch(() => []),
      getJson(`${base}/issues?state=open&per_page=100`, session.accessToken).catch(() => [])
    ]);
    const data: GitHubData = {
      ...slug,
      contributors: parseContributors(contribJson),
      issues: parseIssues(issuesJson)
    };
    log.appendLine(
      `[github] ${slug.owner}/${slug.repo}: ${data.contributors.length} contributors, ${data.issues.length} issues`
    );
    return data;
  } catch (err) {
    log.appendLine(`[github] fetch failed: ${String(err)}`);
    if (interactive) void vscode.window.showErrorMessage(`OMD: GitHub fetch failed. ${String(err)}`);
    return null;
  }
}
