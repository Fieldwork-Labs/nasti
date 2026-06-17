import { useRef } from "react"

import { CurvePath, PhenologyValue, Segments } from "./common"
import { cn } from "../../utils"

type PhenologyRangeDisplayProps = {
  value: PhenologyValue
  className?: string
}

export function PhenologyRangeDisplay({
  value,
  className,
}: PhenologyRangeDisplayProps) {
  const trackRef = useRef<HTMLDivElement>(null)

  return (
    <div className={cn("border-border rounded-md border", className)}>
      <div
        ref={trackRef}
        className="text-muted-foreground relative grid grid-cols-4 text-sm leading-tight"
      >
        <Segments />
        <CurvePath value={value} />
      </div>
    </div>
  )
}
