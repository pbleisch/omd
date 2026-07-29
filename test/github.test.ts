import { describe, it, expect } from 'vitest';
import { parseGitHubRemote, parseContributors, parseIssues } from '../src/shared/github';

/**
 * P7 GitHub integration. The network and auth are host glue that can't be unit-tested; these
 * cover the pure parts — deriving the repo from a remote URL and turning API JSON into the
 * small shapes the `@mention` / `#issue` menus consume. Pull requests must never leak into the
 * issue list, or `#123` could point at the wrong thing.
 */

describe('parsing a GitHub remote', () => {
  it('reads owner/repo from SSH and HTTPS forms, with or without .git', () => {
    expect(parseGitHubRemote('git@github.com:acme/omd.git')).toEqual({ owner: 'acme', repo: 'omd' });
    expect(parseGitHubRemote('https://github.com/acme/omd')).toEqual({ owner: 'acme', repo: 'omd' });
    expect(parseGitHubRemote('https://github.com/acme/omd.git')).toEqual({
      owner: 'acme',
      repo: 'omd'
    });
  });

  it('rejects non-GitHub remotes', () => {
    expect(parseGitHubRemote('git@gitlab.com:acme/omd.git')).toBeNull();
    expect(parseGitHubRemote('https://example.com/acme/omd')).toBeNull();
    expect(parseGitHubRemote('not a url')).toBeNull();
  });
});

describe('parsing contributors', () => {
  it('maps logins and profile URLs', () => {
    const json = [
      { login: 'alice', html_url: 'https://github.com/alice' },
      { login: 'bob', html_url: 'https://github.com/bob' }
    ];
    expect(parseContributors(json)).toEqual([
      { login: 'alice', url: 'https://github.com/alice' },
      { login: 'bob', url: 'https://github.com/bob' }
    ]);
  });

  it('falls back to a derived profile URL and skips junk', () => {
    expect(parseContributors([{ login: 'carol' }, { nope: true }, null])).toEqual([
      { login: 'carol', url: 'https://github.com/carol' }
    ]);
  });

  it('returns empty for a non-array (e.g. an API error object)', () => {
    expect(parseContributors({ message: 'Not Found' })).toEqual([]);
  });
});

describe('parsing issues', () => {
  it('keeps issues and their URLs', () => {
    const json = [
      { number: 12, title: 'Bug', html_url: 'https://github.com/acme/omd/issues/12' },
      { number: 7, title: 'Feature', html_url: 'https://github.com/acme/omd/issues/7' }
    ];
    expect(parseIssues(json)).toEqual([
      { number: 12, title: 'Bug', url: 'https://github.com/acme/omd/issues/12' },
      { number: 7, title: 'Feature', url: 'https://github.com/acme/omd/issues/7' }
    ]);
  });

  it('excludes pull requests (the issues endpoint returns them too)', () => {
    const json = [
      { number: 1, title: 'Real issue', html_url: 'x' },
      { number: 2, title: 'A PR', html_url: 'y', pull_request: { url: 'z' } }
    ];
    expect(parseIssues(json).map((i) => i.number)).toEqual([1]);
  });

  it('returns empty for a non-array', () => {
    expect(parseIssues({ message: 'Bad credentials' })).toEqual([]);
  });
});
