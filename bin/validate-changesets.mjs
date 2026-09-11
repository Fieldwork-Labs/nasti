#!/usr/bin/env node
// Validate the changeset files added by a pull request. A filename alone does
// not prove that a changeset is parseable or targets the mobile app.
//
// Usage: node bin/validate-changesets.mjs <file>...

import { readFileSync } from "node:fs"
import parseModule from "@changesets/parse"

const parse = parseModule.default ?? parseModule
const TARGET_PACKAGE = "nasti-mobile"

const files = process.argv.slice(2).filter(Boolean)

if (files.length === 0) {
  console.error("No changeset files given to validate.")
  process.exit(1)
}

// Every package except the mobile app is ignored. A changeset mixing the app
// with an ignored package makes `changeset version` fail; one naming only
// ignored packages is never consumed. Report both mistakes during PR CI.
const problems = []
let satisfied = false

for (const file of files) {
  let parsed
  try {
    parsed = parse(readFileSync(file, "utf8"))
  } catch (error) {
    problems.push(`${file}: not a parseable changeset (${error.message})`)
    continue
  }

  if (parsed.releases.length === 0) {
    console.log(`${file}: empty changeset (deliberately no version bump)`)
    satisfied = true
    continue
  }

  const foreign = parsed.releases.filter(
    (release) => release.name !== TARGET_PACKAGE,
  )
  const mobile = parsed.releases.find(
    (release) => release.name === TARGET_PACKAGE,
  )

  if (foreign.length > 0) {
    const names = foreign.map((release) => release.name).join(", ")
    problems.push(
      mobile
        ? `${file}: mixes ${TARGET_PACKAGE} with ${names}; Changesets refuses to version a changeset containing both ignored and non-ignored packages`
        : `${file}: bumps ${names}, which ${foreign.length === 1 ? "is" : "are"} ignored, so it would never be consumed`,
    )
    continue
  }

  console.log(`${file}: ${TARGET_PACKAGE} ${mobile.type}`)
  satisfied = true
}

if (problems.length > 0) {
  console.error(
    `::error::Invalid changeset(s). Every entry must bump only ${TARGET_PACKAGE}:`,
  )
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}

if (!satisfied) {
  console.error(
    `::error::No added changeset bumps ${TARGET_PACKAGE}. Run 'pnpm changeset' and select ${TARGET_PACKAGE}, or 'pnpm changeset add --empty' if this change shouldn't bump the mobile app version.`,
  )
  process.exit(1)
}
