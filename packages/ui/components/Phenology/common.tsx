import { cn } from "@nasti/ui/utils"

export type PhenologyValue = [number | null, number | null, number | null]

export const valueToPosition = (value: number) => {
  if (value <= 0) return ((value + 100) / 100) * 75
  return 75 + (value / 100) * 25
}

export const positionToValue = (position: number) => {
  if (position <= 75) return Math.round((position / 75) * 100 - 100)
  return Math.round(((position - 75) / 25) * 100)
}

export const PHENOLOGY_SEGMENTS = [
  {
    startValue: positionToValue(0),
    endValue: positionToValue(25),
    label: "Bud",
  },
  {
    startValue: positionToValue(25),
    endValue: positionToValue(50),
    label: "Flowers",
  },
  {
    startValue: positionToValue(50),
    endValue: positionToValue(75),
    label: "Fruiting",
  },
  {
    startValue: positionToValue(75),
    endValue: positionToValue(100),
    label: "Dispersal",
  },
]

export const buildCurvePath = ([start, peak, end]: number[]) => {
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

export const Segments = () => (
  <>
    {PHENOLOGY_SEGMENTS.map(({ label }, i) => (
      <div
        key={label}
        className={cn(
          "bg-background min-h-15 flex items-center justify-center px-1 text-center",
          i !== 0 ? "border-l border-dashed" : "",
          i === 0 && "rounded-l-md",
          i === PHENOLOGY_SEGMENTS.length - 1 && "rounded-r-md",
        )}
      >
        {label}
      </div>
    ))}
  </>
)

export const CurvePath = ({ value }: { value: PhenologyValue }) => {
  const isComplete = value[0] !== null && value[1] !== null && value[2] !== null
  const curvePath = isComplete
    ? buildCurvePath([
        valueToPosition(value[0] as number),
        valueToPosition(value[1] as number),
        valueToPosition(value[2] as number),
      ])
    : undefined

  if (!curvePath) return
  return (
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
  )
}
