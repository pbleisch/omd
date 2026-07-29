# Security Policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately using GitHub's
[private security advisories](https://github.com/pbleisch/omd/security/advisories/new) rather than a
public issue. Include steps to reproduce and the affected version. You'll get an acknowledgement
within a few days; please allow reasonable time for a fix before public disclosure.

## Scope

OMD is a local VS Code extension: it edits files in your workspace and renders them in a webview. It
has no backend. Relevant trust boundaries and mitigations are documented in
[`docs/operations/THREAT-MODEL.md`](docs/operations/THREAT-MODEL.md). Points most relevant to security reports:

- **Webview sandbox** — the editor runs under a strict Content-Security-Policy; user-authored block
  render code runs only in a nested `allow-scripts`, no-`same-origin` iframe with `default-src 'none'`.
- **Host network use** — the only outbound requests are the opt-in/on-demand link-card metadata
  fetch and GitHub API calls via VS Code's auth; both are described in the README.
- **Untrusted documents** — opening a malicious `.md` should never execute code with editor or host
  privileges. Reports of paths that break this are especially welcome.

## Supported versions

OMD is pre-1.0; only the latest released version is supported. Fixes ship in a new patch release.
