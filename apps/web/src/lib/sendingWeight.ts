/**
 * What a row on the send-for-testing page is actually sending.
 *
 * The rule appears in five places on that page — the weight column, the pure
 * live seed column, both totals, and the payload — so it lives here once. Each
 * of those asking the raw input its own question is how they drift apart.
 */

export type SendingWeight =
  /** The field is blank, or holds the bag's full weight: send the bag itself. */
  | { kind: "whole"; grams: number }
  /** Less than the bag: the database splits this off and sends the child. */
  | { kind: "sample"; grams: number }
  /** Unusable input. `grams` is the bag's full weight, for display fallbacks. */
  | { kind: "invalid"; grams: number }

/**
 * `raw` is the input's string value, so it carries the states a number cannot:
 * empty, mid-typing ("1."), and plain nonsense.
 *
 * Typing the bag's exact weight is treated as sending the whole bag rather than
 * as an error. The database requires a sample to be strictly lighter than its
 * source — a split that left the original at zero would strand it — but that is
 * a fact about how the split is expressed, not something to make a user solve.
 */
export const resolveSendingWeight = (
  raw: string | undefined,
  currentWeightGrams: number,
): SendingWeight => {
  if (!Number.isFinite(currentWeightGrams) || currentWeightGrams <= 0) {
    return { kind: "invalid", grams: 0 }
  }

  const trimmed = (raw ?? "").trim()
  if (trimmed === "") return { kind: "whole", grams: currentWeightGrams }

  const value = Number(trimmed)
  if (!Number.isFinite(value) || value <= 0) {
    return { kind: "invalid", grams: currentWeightGrams }
  }

  if (value > currentWeightGrams) {
    return { kind: "invalid", grams: currentWeightGrams }
  }

  if (value === currentWeightGrams) {
    return { kind: "whole", grams: currentWeightGrams }
  }

  return { kind: "sample", grams: value }
}
