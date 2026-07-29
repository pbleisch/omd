import type { Contributor, Issue, GitHubData } from '../../shared/github';

/**
 * The editor's view of the GitHub data the host fetched: contributors for the `@mention`
 * picker and open issues for `#references`. Empty until the host pushes `github` (which it
 * only does when a session already exists, or after the Connect GitHub command).
 */
let contributors: Contributor[] = [];
let issues: Issue[] = [];

export function setGitHub(data: GitHubData): void {
  contributors = data.contributors;
  issues = data.issues;
}

export function getContributors(): Contributor[] {
  return contributors;
}

export function getIssues(): Issue[] {
  return issues;
}
