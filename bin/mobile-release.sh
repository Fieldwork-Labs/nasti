#!/usr/bin/env bash
# Apply pending mobile changesets, commit the version bump, and push the tag
# that creates the GitHub Release. Future store-publishing workflows should use
# the same tag. See RELEASING.md for the complete flow.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MOBILE_PACKAGE_JSON="apps/mobile/package.json"

confirm() {
  local prompt="$1"
  local reply
  read -r -p "$prompt [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]]
}

mobile_version() {
  node -p "require('./${MOBILE_PACKAGE_JSON}').version"
}

echo "== Mobile release =="
echo

current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$current_branch" != "main" ]]; then
  echo "Releases must be cut from 'main'; you're on '$current_branch'." >&2
  echo "Switch with: git switch main" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean — commit or stash your changes first." >&2
  exit 1
fi

echo "Fetching origin/main..."
git fetch origin main --quiet
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
  if git merge-base --is-ancestor HEAD origin/main; then
    echo "Local main is behind origin/main."
    confirm "Fast-forward to origin/main now?" || exit 1
    git pull --ff-only origin main
  else
    echo "Local main has commits that aren't on origin/main." >&2
    echo "Push or reset them before cutting a release." >&2
    exit 1
  fi
fi

pending_changesets=$(find .changeset -maxdepth 1 -name '*.md' ! -name 'README.md' 2>/dev/null | wc -l | tr -d ' ')
if [[ "$pending_changesets" -eq 0 ]]; then
  echo "No pending changesets in .changeset/ — nothing to release." >&2
  exit 1
fi
echo "Found $pending_changesets pending changeset(s)."
echo

before_version="$(mobile_version)"
echo "Current nasti-mobile version: $before_version"
echo "Running 'pnpm changeset version'..."
pnpm changeset version

after_version="$(mobile_version)"
if [[ "$before_version" == "$after_version" ]]; then
  echo "Version did not change ($after_version) — nothing further to do." >&2
  exit 1
fi

echo
echo "Version bumped: $before_version -> $after_version"
echo
git status --short
echo
confirm "Review the diff above (and apps/mobile/CHANGELOG.md). Commit this version bump?" || {
  echo "Leaving changes uncommitted for review." >&2
  exit 1
}

git add -A
git commit -m "chore: version nasti-mobile to ${after_version}"

echo
confirm "Push this commit to origin/main?" || {
  echo "Commit created locally but not pushed. Push it yourself (or open a PR if main is protected) before tagging." >&2
  exit 1
}

if ! git push origin HEAD:main; then
  echo
  echo "Push to main failed — if main is protected, push this commit on a branch and open a PR instead:" >&2
  echo "  git switch -c release/nasti-mobile-v${after_version}" >&2
  echo "  git push -u origin release/nasti-mobile-v${after_version}" >&2
  echo "Once that PR merges, tag the merged version commit manually:" >&2
  echo "  git tag v${after_version} && git push origin v${after_version}" >&2
  exit 1
fi

tag="v${after_version}"

# A release tag must always point to a commit that has reached origin/main.
git fetch origin main --quiet
if ! git merge-base --is-ancestor HEAD origin/main; then
  echo "HEAD is not on origin/main, refusing to tag ${tag}." >&2
  echo "Get the version-bump commit onto main first, then tag it." >&2
  exit 1
fi

if git rev-parse "$tag" >/dev/null 2>&1 || git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null 2>&1; then
  echo "Tag ${tag} already exists; refusing to replace it." >&2
  exit 1
fi

echo
confirm "Tag this commit as ${tag} and push it (this creates the GitHub Release)?" || {
  echo "Skipping tag. Push it later with: git tag ${tag} && git push origin ${tag}" >&2
  exit 1
}

git tag "$tag"
git push origin "$tag"

echo
echo "Tagged and pushed ${tag}. Watch the release workflow in the Actions tab."
