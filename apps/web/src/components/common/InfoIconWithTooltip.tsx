import { InfoIcon } from "lucide-react"

import { withTooltip } from "@nasti/ui/tooltip"

export const InfoIconWithTooltip = withTooltip(
  <InfoIcon className="h-4 w-4 text-xs" />,
)
