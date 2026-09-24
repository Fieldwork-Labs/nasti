# Releasing the mobile app

NASTI mobile releases use semantic versions managed by
[Changesets](https://github.com/changesets/changesets). Changesets tracks only
the private `nasti-mobile` package; every other workspace package is listed in
`.changeset/config.json`'s `ignore` array and remains unversioned.

The version in `apps/mobile/package.json` is the release version and
`apps/mobile/CHANGELOG.md` is generated from the accumulated changesets.

## During development

Every pull request that changes `apps/mobile/**` must add a changeset:

```bash
pnpm changeset
```

Select `nasti-mobile`, choose a patch, minor, or major bump, and write a short
user-facing summary. The summary becomes an entry in the generated changelog.
The `Require mobile changeset` workflow validates that newly added changesets
are parseable and target only `nasti-mobile`.

If a mobile change deliberately should not bump the app version—for example, a
test-only or CI-only change—add an empty changeset:

```bash
pnpm changeset add --empty
```

## Cutting a release

Make sure `main` is green and contains everything to ship, then run:

```bash
pnpm mobile-release
```

The script checks that the working tree is clean and `main` matches
`origin/main`, applies all pending changesets, shows the resulting version and
changelog changes, and asks before committing, pushing, and tagging. A release
tag has the form `v<version>` and must match `apps/mobile/package.json`.

The equivalent manual flow is:

```bash
pnpm changeset version
git add -A
git commit -m "chore: version nasti-mobile"
git push origin main
git tag "v$(node -p "require('./apps/mobile/package.json').version")"
git push origin "v$(node -p "require('./apps/mobile/package.json').version")"
```

Pushing the tag runs `.github/workflows/release.yml`, which creates an
idempotent GitHub Release using the matching `apps/mobile/CHANGELOG.md` section
as its notes. If that section cannot be found, GitHub generates the notes.

The workflow can be retried manually from the Actions tab with the ref set to
the release tag. It skips manual runs against branches and does nothing when
the GitHub Release already exists.

## Future app-store publishing

NASTI does not publish to TestFlight or Google Play yet. When those pipelines
are added, they should run from the same `v*` tags, verify the tag against
`apps/mobile/package.json`, and use that package version as the native
user-facing version. Manual retries should be accepted only when dispatched
against a tag. This keeps one release identity across GitHub, iOS, and Android.
