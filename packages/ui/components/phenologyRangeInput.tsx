import { X } from "lucide-react"

import { Label } from "@nasti/ui/label"
import { Slider } from "@nasti/ui/slider"
import { cn } from "@nasti/ui/utils"

type PhenologyValue = [number | null, number | null]

type PhenologyRangeInputProps = {
  value: PhenologyValue
  onValueChange: (value: PhenologyValue) => void
  label?: string
  disabled?: boolean
  className?: string
}

const stages = [
  { value: -100, label: "Pre flowering" },
  { value: -75, label: "In bud" },
  { value: -50, label: "Mature flowers" },
  { value: -25, label: "Immature fruit" },
  { value: 0, label: "Seed dispersal" },
  { value: 100, label: "Fruiting completed" },
]

const segmentLabels = [
  "Pre flowering",
  "In bud",
  "Mature flowers",
  "Immature fruit",
  "Seed dispersal to fruiting completed",
]

const valueToPosition = (value: number) => {
  if (value <= 0) return ((value + 100) / 125) * 100
  return 80 + (value / 100) * 20
}

const positionToValue = (position: number) => {
  if (position <= 80) return Math.round((position / 100) * 125 - 100)
  return Math.round(((position - 80) / 20) * 100)
}

const formatPhenologyValue = (value: number | null) =>
  value === null ? "--" : value.toString()

export function PhenologyRangeInput({
  value,
  onValueChange,
  label = "Phenology",
  disabled,
  className,
}: PhenologyRangeInputProps) {
  const hasValue = value[0] !== null && value[1] !== null
  const sliderValue = hasValue
    ? [valueToPosition(value[0] as number), valueToPosition(value[1] as number)]
    : [0, 100]

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <Label>{label}</Label>
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <span>
            {formatPhenologyValue(value[0])}, {formatPhenologyValue(value[1])}
          </span>
          {hasValue && (
            <button
              type="button"
              aria-label="Clear phenology"
              className="border-input bg-background hover:bg-accent inline-flex h-7 w-7 items-center justify-center rounded-md border"
              disabled={disabled}
              onClick={() => onValueChange([null, null])}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <div className="border-border overflow-hidden rounded-md border">
        <div className="divide-border text-muted-foreground grid grid-cols-5 divide-x text-[0.68rem] leading-tight">
          {segmentLabels.map((segmentLabel, index) => (
            <div
              key={segmentLabel}
              className={cn(
                "flex min-h-12 items-center justify-center px-1 text-center",
                index % 2 === 0 ? "bg-muted/70" : "bg-background",
              )}
            >
              {segmentLabel}
            </div>
          ))}
        </div>
        <div className="px-1 py-4">
          <Slider
            min={0}
            max={100}
            step={1}
            minStepsBetweenThumbs={1}
            disabled={disabled}
            value={sliderValue}
            onValueChange={([start, end]) =>
              onValueChange([positionToValue(start), positionToValue(end)])
            }
          />
        </div>
        <div className="text-muted-foreground relative h-5 px-2 pb-2 text-[0.68rem]">
          {stages.map((stage) => (
            <span
              key={stage.value}
              className={cn(
                "absolute text-center",
                stage.value === -100
                  ? "translate-x-0"
                  : stage.value === 100
                    ? "-translate-x-full"
                    : "-translate-x-1/2",
              )}
              style={{ left: `calc(${valueToPosition(stage.value)}%)` }}
            >
              {stage.value}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
