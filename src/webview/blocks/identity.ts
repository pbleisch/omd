/**
 * The comment author, as resolved by the host (git user.name → GitHub → OS user). It starts
 * as a placeholder and is replaced when the host sends `identity`; new comments and the
 * "my reaction" check both read it here so they always agree on who "you" is.
 */
let author = 'you';

export function setAuthor(name: string): void {
  if (name) author = name;
}

export function currentUser(): string {
  return author;
}
