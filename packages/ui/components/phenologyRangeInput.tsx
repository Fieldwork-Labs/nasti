import * as SliderPrimitive from "@radix-ui/react-slider"
import { X } from "lucide-react"

import { Label } from "@nasti/ui/label"
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
    : [50, 50]

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
        <div className="divide-border text-muted-foreground relative grid grid-cols-5 divide-x text-[0.68rem] leading-tight">
          {segmentLabels.map((segmentLabel, i) => (
            <div
              key={segmentLabel}
              className={cn(
                "bg-muted/70 flex min-h-12 items-center justify-center border-x border-dashed px-1 text-center",
                i === 4 ? "border-primary border-l-2 border-solid" : "",
              )}
            >
              {segmentLabel}
            </div>
          ))}
          <SliderPrimitive.Root
            className="absolute inset-0 flex h-full w-full touch-none select-none items-center"
            min={0}
            max={100}
            step={1}
            minStepsBetweenThumbs={1}
            disabled={disabled}
            value={sliderValue}
            onValueChange={([start, end]) => {
              console.log({ start, end })
              onValueChange([positionToValue(start), positionToValue(end)])
            }}
          >
            <SliderPrimitive.Track className="relative h-full w-full grow rounded-none bg-transparent">
              <SliderPrimitive.Range className="bg-primary/30 absolute h-full" />
            </SliderPrimitive.Track>
            {sliderValue?.map((_, index) => (
              <SliderPrimitive.Thumb
                key={index}
                aria-label={index === 0 ? "Phenology start" : "Phenology end"}
                className="bg-primary focus-visible:outline-hidden focus-visible:ring-ring block h-full w-1.5 rounded-none shadow-[0_0_0_1px_hsl(var(--background)),0_0_0_3px_hsl(var(--primary))] transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50"
              />
            ))}
          </SliderPrimitive.Root>
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
