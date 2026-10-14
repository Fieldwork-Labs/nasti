/**
 * How much seed sits in which containers, for batches that have not been
 * cleaned yet.
 *
 * An unprocessed batch has no weight — that arrives with cleaning — so the only
 * measure of "how much" it has is what the collector recorded on the
 * collection: some number of buckets, some number of bags. That amount is
 * optional, so a container can be listed without a count.
 */

type RecordedContainer = {
  amount: number | null
  container: { id: string; name: string }
}

export type ContainerTotal = {
  containerId: string
  name: string
  /** Sum of the amounts that were recorded, or null when none were. */
  amount: number | null
  /** At least one source listed this container without an amount. */
  partial: boolean
}

/**
 * Sums the same container across sources, sorted by name.
 *
 * A source that listed a container without an amount still counts as using it,
 * but adds nothing to the sum — hence `partial`, so the total can say "at least
 * this many" instead of quietly understating.
 */
export const totalContainerAmounts = (
  recorded: RecordedContainer[],
): ContainerTotal[] => {
  const totals = new Map<string, ContainerTotal>()

  for (const { amount, container } of recorded) {
    const total = totals.get(container.id) ?? {
      containerId: container.id,
      name: container.name,
      amount: null,
      partial: false,
    }

    if (amount === null) {
      total.partial = true
    } else {
      total.amount = (total.amount ?? 0) + amount
    }

    totals.set(container.id, total)
  }

  return [...totals.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** "3 × Bucket", "3+ × Bucket" when incomplete, or just "Bucket" with no count. */
export const formatContainerTotal = ({
  name,
  amount,
  partial,
}: Pick<ContainerTotal, "name" | "amount" | "partial">): string => {
  if (amount === null) return name
  return `${amount}${partial ? "+" : ""} × ${name}`
}
