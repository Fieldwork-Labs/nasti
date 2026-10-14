import { Badge } from "@nasti/ui/badge"

import { useBatchContainers } from "@/hooks/useContainers"
import {
  formatContainerTotal,
  totalContainerAmounts,
} from "@/lib/containerAmounts"

/**
 * What an unprocessed batch holds, by container. There is no weight to show
 * until it is cleaned, so this is the measure of how much of it there is.
 */
export const BatchContainerBadges = ({
  batch,
}: {
  batch: { id: string; collection_id: string | null }
}) => {
  const { data: recorded, isLoading } = useBatchContainers(batch)
  const totals = totalContainerAmounts(recorded)

  if (totals.length === 0) {
    return (
      <span className="text-muted-foreground text-xs">
        {isLoading ? "Loading…" : "None recorded"}
      </span>
    )
  }

  return (
    <div className="flex flex-wrap gap-1">
      {totals.map((total) => (
        <Badge key={total.containerId} variant="secondary">
          {formatContainerTotal(total)}
        </Badge>
      ))}
    </div>
  )
}
