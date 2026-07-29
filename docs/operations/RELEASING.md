# Releasing OMD

The release plumbing is in place (bundling, `.vscodeignore`, manifest, icon, CI, docs). This is the
checklist for cutting an actual release, including the steps only a human with the right accounts
can do.

## Versions and channels

The VS Code Marketplace **does not accept semver pre-release tags** — `0.1.0-beta.1` is rejected;
versions must be plain `major.minor.patch` integers. The channel is therefore encoded in the version
itself, following the VS Code convention:

| Minor version | Channel | Example |
| --- | --- | --- |
| **odd** | pre-release | `0.1.0`, `0.1.1`, `0.3.0` |
| **even** | stable | `0.2.0`, `1.0.0` |

`.github/workflows/release.yml` reads that parity and passes `--pre-release` accordingly, so the
channel is a property of the number you tag — there's no separate switch to forget.

Two things that bite people:

- A version published as pre-release **can never be republished as stable**. That number is spent.
  Ship the stable build under a new (even-minor) version.
- VS Code only offers a pre-release to opted-in users if it is **greater than** the latest stable
  version. Keep the pre-release line ahead of the stable line.

**Pre-release is not private.** It is publicly listed, searchable, and installable by anyone who
clicks "Switch to Pre-Release Version". The Marketplace has no unlisted or private tier. For a
genuinely closed beta, use the VSIX path below.

## One-time setup (manual — needs accounts)

1. **Make the GitHub repo public before the first Marketplace publish.** `vsce` rewrites every
   relative link in the listing README to `https://github.com/pbleisch/omd/...` when it packages.
   While the repo is private, screenshots and any relative link 404 for Marketplace visitors.
   (Verify after packaging by unzipping the `.vsix` and reading `extension/readme.md`.) If the repo
   moves, update `repository`, `bugs`, and `homepage` in `package.json`, the URLs in `SECURITY.md`,
   and the links in `README.md` and `MARKETPLACE.md`.
2. **Create an Azure DevOps organization.** Marketplace publishers are backed by Azure DevOps. Sign
   in at <https://dev.azure.com> with a Microsoft account and create an org (free). You won't use it
   for anything else; it exists to anchor the token.
3. **Register the Marketplace publisher** at
   <https://marketplace.visualstudio.com/manage/createpublisher>. The **publisher ID is permanent and
   cannot be renamed**, and must match `publisher` in `package.json` (`pbleisch`). The extension's
   identity becomes `pbleisch.omd`.
4. **Create a Personal Access Token.** dev.azure.com → user icon → **Personal access tokens** → **New
   Token**:
   - **Organization: "All accessible organizations"** — scoping it to a single org is the most common
     cause of a 401 at publish time, with an unhelpful error message.
   - **Scopes: Custom defined → Marketplace → Manage.**
   - Expiration is capped at 1 year; diary the rotation.
   - Copy it immediately — it is shown once.
5. **Add the CI secret.** Add `VSCE_PAT` = that token to the GitHub repo's Actions secrets. The
   release workflow publishes to the Marketplace **only** when this secret is present; without it, it
   still builds the `.vsix` and attaches it to the GitHub Release.
6. *(Optional)* Register on the [Open VSX registry](https://open-vsx.org) as well — VSCodium, Cursor,
   and other non-Microsoft builds do not use the MS Marketplace. Publish there with `npx ovsx publish`.

## Phase 0 — private beta, no accounts needed

The closed way to get builds to a handful of testers. Requires none of the setup above:

```bash
npm run package                 # -> omd-<version>.vsix
```

Or push a version tag and let CI build it and attach it to the GitHub Release. Testers install with:

```bash
code --install-extension omd-<version>.vsix
```

(or Extensions view → `···` → **Install from VSIX…**). There are no auto-updates on this path —
each new build is a manual reinstall for them, so keep the round short.

## Before each release

- [ ] `npm ci && npm run lint && npm run typecheck && npm run build && npm test` all green.
- [ ] `npm run test:integration` green (a real VS Code run).
- [ ] Bump `version` in `package.json` — **odd minor for a pre-release**, even for stable — and move
      the `[Unreleased]` items in `CHANGELOG.md` under the new version with today's date.
- [ ] `npm run package` and **install the resulting `.vsix` into a clean VS Code**; open a `.md`,
      confirm rendering, insert a few blocks, export, and check the README preview looks right.
- [ ] **Screenshots are in `MARKETPLACE.md`.** The listing page is `MARKETPLACE.md`, not `README.md`
      (passed via `--readme-path` in the npm scripts *and* the release workflow — both must carry it).
      Its screenshot placeholders are HTML comments describing the shot to capture; uncomment each
      image line once the file exists under `docs/images/`. A listing with no images badly
      undersells a visual editor.
- [ ] Unzip the `.vsix` and confirm no source, `node_modules`, source maps, or `showcase/` snuck in,
      and that `extension/readme.md`'s rewritten links resolve against the public repo.
- [ ] Regenerate `THIRD-PARTY-NOTICES.md` if dependencies changed, and run `npm audit` — confirm no
      new advisories in *shipped* (non-dev) dependencies.
- [ ] Review `docs/operations/THREAT-MODEL.md` residual risks; make sure nothing new is unaddressed.

## Cutting the release

```bash
git tag v<version>
git push origin v<version>
```

The `Release` workflow (`.github/workflows/release.yml`) verifies the tag matches `package.json`,
runs lint/typecheck/tests, packages the `.vsix` (with `--pre-release` on odd minors), attaches it to
a GitHub Release, and — if `VSCE_PAT` is set — publishes that same artifact to the Marketplace. It
publishes the exact file it attached, so testers and the Marketplace get byte-identical builds.

To publish manually instead:

```bash
npm run package                                  # add --pre-release for an odd-minor version
npx vsce publish --pre-release --packagePath omd-<version>.vsix
```

`vsce` cross-checks that a `--pre-release` publish was packaged with `--pre-release`, so the two
can't drift apart. `VSCE_PAT` is read from the environment; `npx vsce login pbleisch` also works.

## Regenerating assets

- **Icon:** edit `icon.svg`, then `npm run build:icon` (uses `rsvg-convert`) to refresh `icon.png` at
  256×256. Don't commit a multi-megabyte icon — it ships in every `.vsix`.
- **Third-party notices:** derived from the esbuild bundle metafiles (see the generator approach in
  the repo history); re-run when the bundled dependency set changes.

## Known remaining items

- Lazy-load the heavy webview libraries — `media/webview.js` is 5.7 MB and `media/mermaid.min.js`
  another 3.4 MB; this is the biggest lever on both package size and startup.
- Establish the runtime performance baselines in `docs/operations/PERFORMANCE.md`.
- Residual risks tracked in `docs/operations/THREAT-MODEL.md`.
