/**
 * Pure live seed for a single bag.
 *
 * A quality test stores two things that matter here, both of them ratios and so
 * both independent of how much seed was in front of the tester:
 *
 *   tpsu — mean weight of one seed, in grams
 *   pls  — the fraction of that weight which is pure, live seed
 *
 * The test also stores `plsCount`, but that is deliberately not used: the
 * database computes it against the whole batch's current weight at the moment
 * the test was recorded, so it answers a different question from "how much live
 * seed is in this bag", and it moves as bags come and go.
 *
 * So: seeds in the bag is weight over mean seed weight, and the live portion of
 * those is that count times the live fraction.
 */

export type PureLiveSeedStatistics = {
  /** Mean weight of a single seed, in grams. */
  tpsu: number
  /** Pure live seed fraction, between 0 and 1. */
  pls: number
}

/**
 * Estimated pure live seed count for a bag of the given weight.
 *
 * Null when it cannot be known rather than zero, because "we have not tested
 * this" and "this contains no live seed" are very different things to show
 * someone about to send seed away.
 */
export const estimatePureLiveSeedCount = (
  weightGrams: number | null | undefined,
  statistics: PureLiveSeedStatistics | null | undefined,
): number | null => {
  if (weightGrams === null || weightGrams === undefined) return null
  if (!statistics) return null

  const { tpsu, pls } = statistics

  // A zero or negative mean seed weight would divide the bag into infinitely
  // many seeds. It means the test is unusable, not that the bag is enormous.
  if (!Number.isFinite(tpsu) || tpsu <= 0) return null
  if (!Number.isFinite(pls) || pls < 0) return null
  if (!Number.isFinite(weightGrams) || weightGrams <= 0) return 0

  return Math.round((weightGrams / tpsu) * pls)
}

/**
 * Reads the two ratios off a test's `statistics` JSON.
 *
 * `statistics` is populated by a database trigger after the test is written, so
 * it is legitimately null for a moment on a freshly recorded test, and stays
 * null for a test the trigger could not compute.
 */
export const readPureLiveSeedStatistics = (
  statistics: unknown,
): PureLiveSeedStatistics | null => {
  if (!statistics || typeof statistics !== "object") return null

  const { tpsu, pls } = statistics as Record<string, unknown>

  if (typeof tpsu !== "number" || typeof pls !== "number") return null
  if (!Number.isFinite(tpsu) || !Number.isFinite(pls)) return null

  return { tpsu, pls }
}
