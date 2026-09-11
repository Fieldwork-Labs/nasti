# Changesets

This directory contains release notes for the NASTI mobile app. Changesets only
tracks `nasti-mobile`; the other private workspace packages remain unversioned.

Run `pnpm changeset` when a pull request changes `apps/mobile/**`, or
`pnpm changeset add --empty` when the change deliberately should not bump the
mobile version. See [RELEASING.md](../RELEASING.md) for the complete release
flow.
