/**
 * GitHub data shapes and the pure parsing of API responses. The network and auth
 * live on the host; everything here — deriving the repo from a remote URL, turning API JSON
 * into the small shapes the editor needs — is pure and testable, which matters because the
 * network half can't be exercised in a unit test.
 */

export interface Contributor {
  login: string;
  url: string;
}

export interface Issue {
  number: number;
  title: string;
  url: string;
}

export interface GitHubData {
  owner: string;
  repo: string;
  contributors: Contributor[];
  issues: Issue[];
}

/** Extract `owner/repo` from a GitHub remote URL (SSH or HTTPS), or null. */
export function parseGitHubRemote(url: string): { owner: string; repo: string } | null {
  const s = url.trim();
  const ssh = /^git@github\.com:([\w.-]+)\/([\w.-]+?)(?:\.git)?$/.exec(s);
  if (ssh) return { owner: ssh[1], repo: ssh[2] };
  const https = /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(s);
  if (https) return { owner: https[1], repo: https[2] };
  return null;
}

function asRecords(json: unknown): Record<string, unknown>[] {
  return Array.isArray(json) ? (json.filter((x) => x && typeof x === 'object') as Record<string, unknown>[]) : [];
}

/** Parse the `/contributors` response into logins + profile URLs. */
export function parseContributors(json: unknown): Contributor[] {
  return asRecords(json)
    .filter((x) => typeof x.login === 'string')
    .map((x) => ({
      login: x.login as string,
      url: typeof x.html_url === 'string' ? (x.html_url as string) : `https://github.com/${x.login as string}`
    }));
}

/**
 * Parse the `/issues` response. The GitHub issues endpoint returns pull requests too (they
 * carry a `pull_request` key); those are excluded so `#123` only ever means an issue.
 */
export function parseIssues(json: unknown): Issue[] {
  return asRecords(json)
    .filter((x) => typeof x.number === 'number' && typeof x.title === 'string' && !x.pull_request)
    .map((x) => ({
      number: x.number as number,
      title: x.title as string,
      url: typeof x.html_url === 'string' ? (x.html_url as string) : ''
    }));
}
