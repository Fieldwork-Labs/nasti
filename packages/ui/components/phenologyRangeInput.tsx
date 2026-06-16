import * as SliderPrimitive from "@radix-ui/react-slider"
import { useRef, type PointerEvent as ReactPointerEvent } from "react"
import { X } from "lucide-react"

import { Label } from "@nasti/ui/label"
import { cn } from "@nasti/ui/utils"

type PhenologyValue = [number | null, number | null, number | null]

type PhenologyRangeInputProps = {
  value: PhenologyValue
  onValueChange: (value: PhenologyValue) => void
  label?: string
  disabled?: boolean
  className?: string
}

const segmentLabels = ["Bud", "Flowers", "Fruiting", "Dispersal"]

const valueToPosition = (value: number) => {
  if (value <= 0) return ((value + 100) / 100) * 75
  return 75 + (value / 100) * 25
}

const positionToValue = (position: number) => {
  if (position <= 75) return Math.round((position / 75) * 100 - 100)
  return Math.round(((position - 75) / 25) * 100)
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

const buildCurvePath = ([start, peak, end]: number[]) => {
  if (start === end) return ""

  const width = 100
  const baseline = 92
  const top = 18
  const amplitude = baseline - top
  const points = Array.from({ length: 49 }, (_, index) => {
    const progress = index / 48
    const x = start + (end - start) * progress
    const sideWidth = x <= peak ? peak - start : end - peak
    const distance = Math.abs(x - peak)
    const sigma = Math.max(sideWidth / 2.45, 1)
    const taper = sideWidth === 0 ? 0 : Math.exp(-0.5 * (distance / sigma) ** 2)
    const endpointFade =
      x <= peak
        ? Math.sin(((x - start) / Math.max(peak - start, 1)) * (Math.PI / 2))
        : Math.sin(((end - x) / Math.max(end - peak, 1)) * (Math.PI / 2))
    const y = baseline - amplitude * taper * endpointFade

    return {
      x: (x / 100) * width,
      y,
    }
  })

  const line = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(" ")

  return `${line} L ${(end / 100) * width} ${baseline} L ${
    (start / 100) * width
  } ${baseline} Z`
}

type PhenologyThumb = {
  key: "start" | "end"
  position: number
}

export function PhenologyRangeInput({
  value,
  onValueChange,
  label = "Phenology",
  disabled,
  className,
}: PhenologyRangeInputProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const thumbs = [
    value[0] !== null
      ? { key: "start" as const, position: valueToPosition(value[0]) }
      : null,
    value[2] !== null
      ? { key: "end" as const, position: valueToPosition(value[2]) }
      : null,
  ].filter((thumb): thumb is PhenologyThumb => thumb !== null)
  const sliderValue = thumbs.map((thumb) => thumb.position)
  const peakPosition = value[1] !== null ? valueToPosition(value[1]) : null
  const isComplete = value[0] !== null && value[1] !== null && value[2] !== null
  const curvePath = isComplete
    ? buildCurvePath([
        valueToPosition(value[0] as number),
        valueToPosition(value[1] as number),
        valueToPosition(value[2] as number),
      ])
    : ""

  const getPositionFromClientX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return null
    return clamp(((clientX - rect.left) / rect.width) * 100, 0, 100)
  }

  const updatePeakFromClientX = (clientX: number) => {
    const position = getPositionFromClientX(clientX)
    if (position === null) return

    const startPosition = value[0] !== null ? valueToPosition(value[0]) : 0
    const endPosition = value[2] !== null ? valueToPosition(value[2]) : 100
    const nextPeak = positionToValue(
      clamp(position, startPosition, endPosition),
    )

    onValueChange([value[0], nextPeak, value[2]])
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || isComplete) return
    if ((event.target as HTMLElement).closest("[data-phenology-thumb]")) return

    const position = getPositionFromClientX(event.clientX)
    if (position === null) return
    const phenologyValue = positionToValue(position)

    event.preventDefault()
    event.stopPropagation()

    if (value[1] === null) {
      onValueChange([
        value[0] !== null && value[0] <= phenologyValue ? value[0] : null,
        phenologyValue,
        value[2] !== null && value[2] >= phenologyValue ? value[2] : null,
      ])
      return
    }

    if (phenologyValue <= value[1]) {
      onValueChange([phenologyValue, value[1], value[2]])
      return
    }

    onValueChange([value[0], value[1], phenologyValue])
  }

  const handlePeakPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (disabled) return

    event.preventDefault()
    event.stopPropagation()
    updatePeakFromClientX(event.clientX)

    const handlePointerMove = (moveEvent: PointerEvent) => {
      updatePeakFromClientX(moveEvent.clientX)
    }
    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex min-h-14 items-center justify-between gap-2">
        <Label>{label}</Label>
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          {value[1] !== null && (
            <button
              type="button"
              aria-label="Clear phenology"
              className="border-input bg-background hover:bg-accent inline-flex h-7 w-7 items-center justify-center rounded-md border"
              disabled={disabled}
              onClick={() => onValueChange([null, null, null])}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <div className="border-border rounded-md border">
        <div
          ref={trackRef}
          className="text-muted-foreground relative grid grid-cols-4 text-sm leading-tight"
          onPointerDown={handlePointerDown}
        >
          {segmentLabels.map((segmentLabel, i) => (
            <div
              key={segmentLabel}
              className={cn(
                "bg-background min-h-15 flex items-center justify-center px-1 text-center",
                i !== 0 ? "border-l border-dashed" : "",
                i === 0 && "rounded-l-md",
                i === segmentLabels.length - 1 && "rounded-r-md",
              )}
            >
              {segmentLabel}
            </div>
          ))}
          {sliderValue.length > 0 && (
            <SliderPrimitive.Root
              className="absolute inset-0 flex h-full w-full touch-none select-none items-center"
              min={0}
              max={100}
              step={1}
              minStepsBetweenThumbs={1}
              disabled={disabled}
              value={sliderValue}
              onValueChange={(positions) => {
                const nextValue: PhenologyValue = [value[0], value[1], value[2]]
                positions.forEach((position, index) => {
                  const thumb = thumbs[index]
                  if (!thumb) return
                  const nextPhenologyValue = positionToValue(position)
                  if (thumb.key === "start") nextValue[0] = nextPhenologyValue
                  if (thumb.key === "end") nextValue[2] = nextPhenologyValue
                })
                onValueChange(nextValue)
              }}
            >
              <SliderPrimitive.Track className="relative h-full w-full grow rounded-none bg-transparent">
                {isComplete && (
                  <SliderPrimitive.Range className="bg-primary/30 absolute h-full" />
                )}
                {curvePath && (
                  <svg
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    preserveAspectRatio="none"
                    viewBox="0 0 100 100"
                  >
                    <path
                      d={curvePath}
                      className="fill-primary/45 stroke-primary"
                      strokeWidth="1.8"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                )}
              </SliderPrimitive.Track>
              {thumbs.map((thumb) => {
                return (
                  <SliderPrimitive.Thumb
                    key={thumb.key}
                    data-phenology-thumb=""
                    aria-label={
                      thumb.key === "start"
                        ? "Phenology start"
                        : "Phenology end"
                    }
                    className={cn(
                      "focus-visible:outline-hidden focus-visible:ring-ring transition-colors focus-visible:ring-1 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50",
                      "bg-primary h-full w-1.5 rounded-full shadow-[0_0_0_1px_hsl(var(--background)),0_0_0_3px_hsl(var(--primary))]",
                    )}
                  />
                )
              })}
            </SliderPrimitive.Root>
          )}
          {peakPosition !== null && (
            <button
              type="button"
              data-phenology-thumb=""
              aria-label="Phenology peak"
              disabled={disabled}
              className="focus-visible:outline-hidden focus-visible:ring-ring absolute top-[-18px] z-30 flex h-2 w-2 -translate-x-1/2 cursor-grab touch-none items-start justify-center rounded-none bg-transparent p-0 active:cursor-grabbing disabled:pointer-events-none disabled:opacity-50"
              style={{ left: `calc(${peakPosition}%)` }}
              onPointerDown={handlePeakPointerDown}
            >
              <span className="bg-primary after:border-t-primary rounded-xs pointer-events-none relative h-3 w-1.5 shadow-[0_0_0_1px_hsl(var(--primary))] after:absolute after:left-1/2 after:top-full after:h-0 after:w-0 after:-translate-x-1/2 after:border-x-[4px] after:border-t-[5px] after:border-x-transparent" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
