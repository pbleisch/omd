# Releasing OMD

Most of the release plumbing is in place (bundling, `.vscodeignore`, manifest, icon, CI, docs).
This is the checklist for cutting an actual release, including the few steps only a human with the
right accounts can do.

## One-time setup (manual — needs accounts)

1. **Create the public GitHub repo.** The manifest currently assumes `github.com/pbleisch/omd`. If
   the repo lives elsewhere, update `repository`, `bugs`, `homepage` in `package.json`, the URLs in
   `SECURITY.md`, and the badges/links in `README.md`.
2. **Register a VS Code Marketplace publisher.** Create a publisher at
   <https://marketplace.visualstudio.com/manage> and set `publisher` in `package.json` to its ID
   (currently `pbleisch`). Create an Azure DevOps Personal Access Token with **Marketplace →
   Manage** scope.
3. **Add the CI secret.** In the GitHub repo, add `VSCE_PAT` = that token. The release workflow
   publishes to the Marketplace only when this secret is present; without it, it still builds and
   attaches the `.vsix` to the GitHub Release.
4. *(Optional)* Register on the Open VSX registry too if you want the extension available to VSCodium
   and other non-Microsoft builds.

## Before each release

- [ ] `npm ci && npm run lint && npm run build && npm test` all green.
- [ ] `npm run test:integration` green (a real VS Code run).
- [ ] Bump `version` in `package.json` and move the `[Unreleased]` items in `CHANGELOG.md` under the
      new version with today's date.
- [ ] `npm run package` and **install the resulting `.vsix` into a clean VS Code** (`code
      --install-extension omd-<version>.vsix`); open a `.md`, confirm rendering, insert a few blocks,
      export, and check the Marketplace README preview looks right.
- [ ] Regenerate `THIRD-PARTY-NOTICES.md` if dependencies changed, and run `npm audit` — confirm no
      new advisories in *shipped* (non-dev) dependencies.
- [ ] Review `docs/operations/THREAT-MODEL.md` residual risks; make sure nothing new is unaddressed.

## Cutting the release

```bash
git tag v<version>
git push origin v<version>
```

The `Release` workflow (`.github/workflows/release.yml`) builds, tests, packages the `.vsix`,
attaches it to a GitHub Release, and — if `VSCE_PAT` is set — publishes to the Marketplace. To
publish manually instead:

```bash
npm run package                 # -> omd-<version>.vsix
npx vsce publish --pat <token>  # or: npx vsce publish (with VSCE_PAT in env)
```

## Regenerating assets

- **Icon:** edit `icon.svg`, then `npm run build:icon` (uses `rsvg-convert`) to refresh `icon.png`.
- **Third-party notices:** derived from the esbuild bundle metafiles (see the generator approach in
  the repo history); re-run when the bundled dependency set changes.

## Known remaining items (see BUGS.md “Release readiness”)

- Consider sanitizing HTML export output (threat-model R1).
- Add SSRF guards to the link-card fetch (threat-model R2).
- Lazy-load the heavy webview libraries (performance, biggest lever).
- Establish the runtime performance baselines in `docs/operations/PERFORMANCE.md`.
