# Releasing

## Versioning and changelogs (Changesets)

1. Every PR that changes user-facing behavior of a package adds a changeset
   (`corepack pnpm changeset`).
2. On `main`, the **Release** workflow keeps a "chore(release): version packages" PR up to date.
3. Merging that PR bumps versions (SemVer) and writes each package's `CHANGELOG.md`.

npm publishing is not enabled yet. When `@kadr/project-format` gets a build step, add a
`publish-script` to `.github/workflows/release.yml` and publish with npm provenance.

## Desktop app

### How installed apps get updates

Installed apps update themselves with
[electron-updater](https://www.electron.build/auto-update) from a **static update feed** on
Cloudflare R2 (electron-builder's `generic` provider). There is no update server to run:

```
<KADR_UPDATE_URL>/
  latest.yml           Windows, stable     ┐ metadata: version, file names, SHA-512 checksums
  latest-mac.yml       macOS, stable       │ (served with Cache-Control: no-cache)
  latest-linux.yml     Linux, stable       │
  beta*.yml            beta channel        ┘
  Kadr-Setup-1.2.0.exe (+ .blockmap)       ┐ installers and update payloads, never overwritten
  Kadr-1.2.0-mac-arm64.zip, …              ┘ (served with Cache-Control: immutable)
```

- The feed URL is **baked into the build** from `KADR_UPDATE_URL` (`app-update.yml` in the app's
  resources). Builds without it — forks, local packaging — have no feed; the app shows
  "This build has no update feed configured" and never polls anyone's server.
- The app checks 15 s after launch and every 4 hours, downloads in the background, verifies the
  SHA-512, and installs when the app quits, or right away with **Restart to update** (control
  panel banner, More → Updates, or the tray menu). It never checks, downloads or restarts while
  a recording is in progress, and it never downgrades.
- Windows downloads only the changed blocks of the installer (blockmaps); installs are per-user,
  so updates need no administrator prompt.
- **Channels:** users pick Stable or Beta (More → Updates). A version with a prerelease tag
  (`1.3.0-beta.1`) is published to `beta*.yml` only; stable releases are published to both, so beta
  testers move on to the stable release once it is newer than their beta.
- **macOS auto-update requires a signed and notarized build** (Squirrel.Mac checks the code
  signature). Unsigned Windows and Linux (AppImage) builds update fine; `.deb` installs are updated
  by the package manager instead.
- Admins can turn updates off with the environment variable `KADR_DISABLE_UPDATES=1`.

### Configuration

| Name              | Where                | Purpose                                                                            |
| ----------------- | -------------------- | ---------------------------------------------------------------------------------- |
| `KADR_UPDATE_URL` | Actions **variable** | Public feed URL baked into builds, e.g. `https://updates.example.com/kadr/desktop` |
| `R2_PUBLIC_URL`   | Actions **variable** | Public base URL of the bucket; `KADR_UPDATE_URL` must be a path under it           |
| `R2_ENDPOINT`     | Actions **secret**   | S3 API endpoint, `https://<account-id>.r2.cloudflarestorage.com`                   |
| `R2_BUCKET`       | Actions **secret**   | Bucket name                                                                        |
| `R2_ACCESS_KEY`   | Actions **secret**   | R2 API token access key ID (Object Read & Write, scoped to the bucket)             |
| `R2_SECRET_KEY`   | Actions **secret**   | R2 API token secret                                                                |
| `R2_REGION`       | optional             | Defaults to `auto`                                                                 |

For local releases, put the same names in the repository-root `.env` (gitignored; template in
`.env.example`). Never commit credentials: the repository is public.

**Use a custom domain for the feed before the first public release.** Installed apps keep polling
the URL they were built with for as long as they are installed, so it must never change. The
`r2.dev` development URL is rate-limited and not meant for production; connect a domain you
control to the bucket (R2 → Settings → Custom Domains, e.g. `updates.kadr.dev`) and use that.

### Release steps

1. Bump `apps/desktop/package.json` `version` (normally via the version PR). Use a prerelease tag
   (`1.3.0-beta.1`) for beta-only releases.
2. Tag and push: `git tag desktop-v1.3.0 && git push origin desktop-v1.3.0`.
3. The **Desktop release** workflow builds Windows, macOS and Linux installers (signed when the
   secrets below exist). The `publish` job runs in the `release` environment — add required
   reviewers there so a person approves every release — and then:
   - verifies every installer against the checksums in the metadata,
   - uploads installers first and metadata last, so apps never see metadata for files that
     aren't there yet, and refuses to overwrite a version that is already published,
   - reads the public feed back to confirm it serves the new version,
   - attaches build provenance (Sigstore) and creates a **draft** GitHub Release.
4. Installed apps pick the release up on their next check (within 4 hours).

**Smoke-test before tagging** (record, pause, restart, discard, stop; tray; shortcuts; an update
from the previous version). Once metadata is live, every install downloads the release.

### Releasing from a workstation

```bash
corepack pnpm --filter @kadr/desktop dist                       # installers for this OS
node apps/desktop/scripts/publish-update.mjs --dry-run          # validate, list what would upload
corepack pnpm release:desktop                                   # build + publish
```

Only one OS's metadata is produced per machine (`latest.yml` on Windows, `latest-mac.yml` on
macOS), so the CI workflow is the normal path.

### Rolling back a bad release

Apps never downgrade, so roll forward: fix, bump the patch version, and release again. To stop a
bad release from spreading in the meantime, re-upload the previous version's `latest*.yml` (from
the previous release's artifacts) with `Cache-Control: no-cache`; installs that already updated
stay on the bad version until the fix ships.

### Testing updates locally

1. Package the current version: `corepack pnpm --filter @kadr/desktop dist`.
2. Copy `apps/desktop/release/<version>/` somewhere, bump `version` in its `latest.yml` (e.g. to
   `9.9.9`), and serve the folder: `npx http-server <folder> -p 8090`.
3. Run the app against it: `KADR_DEV_UPDATE_URL=http://localhost:8090 corepack pnpm dev:desktop`
   and watch the `[updater]` log lines and More → Updates (installing is skipped in dev).

### Signing secrets

| Secret                                                      | Platform | Purpose                                                                                  |
| ----------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `MAC_CERTIFICATE_P12_BASE64`, `MAC_CERTIFICATE_PASSWORD`    | macOS    | Developer ID Application certificate                                                     |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`  | macOS    | Notarization                                                                             |
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` | Windows  | Azure Trusted Signing (also set `win.azureSignOptions` in `electron-builder.config.mjs`) |

Without these secrets the workflow still produces **unsigned** builds: Windows shows a SmartScreen
warning on first install, and macOS builds can't auto-update.

### Verifying a release artifact

```bash
gh attestation verify Kadr-Setup-1.3.0.exe --repo <owner>/kadr
```

## Release checklist

- [ ] CI green on `main`; no open security advisories (Dependabot, CodeQL, cargo-deny)
- [ ] Version PR merged; changelog reads well
- [ ] Desktop artifacts smoke-tested on Windows and macOS (Linux best effort), including updating
  from the previous release
- [ ] Release notes mention breaking changes and any `.kadr` format changes
