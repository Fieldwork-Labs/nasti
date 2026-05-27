import * as React from "react"

import { cn } from "@nasti/ui/utils"

type SliderProps = {
  value: number[]
  onValueChange?: (value: number[]) => void
  min?: number
  max?: number
  step?: number
  minStepsBetweenThumbs?: number
  disabled?: boolean
  className?: string
}

const Slider = React.forwardRef<HTMLDivElement, SliderProps>(
  (
    {
      className,
      value,
      onValueChange,
      min = 0,
      max = 100,
      step = 1,
      minStepsBetweenThumbs = 0,
      disabled,
    },
    ref,
  ) => {
    const [start, end] = value
    const range = max - min
    const startPercent = ((start - min) / range) * 100
    const endPercent = ((end - min) / range) * 100

    const updateValue = (index: number, nextValue: number) => {
      if (index === 0) {
        onValueChange?.([
          Math.min(nextValue, end - minStepsBetweenThumbs * step),
          end,
        ])
        return
      }

      onValueChange?.([
        start,
        Math.max(nextValue, start + minStepsBetweenThumbs * step),
      ])
    }

    return (
      <div
        ref={ref}
        className={cn(
          "relative flex h-7 w-full touch-none select-none items-center",
          disabled && "opacity-50",
          className,
        )}
      >
        <div className="bg-secondary absolute h-2 w-full rounded-full" />
        <div
          className="bg-primary absolute h-2 rounded-full"
          style={{
            left: `${startPercent}%`,
            width: `${endPercent - startPercent}%`,
          }}
        />
        {value.map((thumbValue, index) => (
          <input
            key={index}
            type="range"
            aria-label={index === 0 ? "Range start" : "Range end"}
            min={min}
            max={max}
            step={step}
            value={thumbValue}
            disabled={disabled}
            onChange={(event) =>
              updateValue(index, Number(event.currentTarget.value))
            }
            className="[&::-moz-range-thumb]:border-primary [&::-moz-range-thumb]:bg-background [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-background pointer-events-none absolute h-7 w-full appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2"
          />
        ))}
      </div>
    )
  },
)
Slider.displayName = "Slider"

export { Slider }
