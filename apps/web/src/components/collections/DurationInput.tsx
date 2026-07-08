import { Button } from "@nasti/ui/button"
import { Input } from "@nasti/ui/input"
import { Label } from "@nasti/ui/label"
import { X } from "lucide-react"

import { durationToTimeValue, timeValueToDuration } from "@/lib/duration"

type DurationInputProps = {
  value: string | null
  onChange: (value: string | null) => void
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

const toTwoDigits = (value: number) => value.toString().padStart(2, "0")

const parseDurationParts = (value: string | null) => {
  const timeValue = durationToTimeValue(value) || "00:00"
  const [hours = "00", minutes = "00"] = timeValue.split(":")

  return {
    hours: Number(hours),
    minutes: Number(minutes),
  }
}

export function DurationInput({ value, onChange }: DurationInputProps) {
  const { hours, minutes } = parseDurationParts(value)

  const handleChange = (nextHours: number, nextMinutes: number) => {
    onChange(
      timeValueToDuration(
        `${toTwoDigits(clamp(nextHours, 0, 99))}:${toTwoDigits(
          clamp(nextMinutes, 0, 59),
        )}`,
      ),
    )
  }

  return (
    <div className="form-group flex w-full flex-col gap-2">
      <div className="grid w-full items-center gap-1.5">
        <Label htmlFor="duration-hours">Duration</Label>
        <div className="flex items-center gap-2">
          <div
            className="flex flex-1 items-center gap-2"
            aria-label="Duration in hours and minutes"
          >
            <Input
              id="duration-hours"
              aria-label="Duration hours"
              inputMode="numeric"
              pattern="[0-9]*"
              value={toTwoDigits(hours)}
              className="text-center"
              onChange={(event) =>
                handleChange(Number(event.currentTarget.value) || 0, minutes)
              }
            />
            <span className="text-muted-foreground">:</span>
            <Input
              aria-label="Duration minutes"
              inputMode="numeric"
              pattern="[0-9]*"
              value={toTwoDigits(minutes)}
              className="text-center"
              onChange={(event) =>
                handleChange(hours, Number(event.currentTarget.value) || 0)
              }
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0"
            aria-label="Clear duration"
            disabled={!value}
            onClick={() => onChange(null)}
          >
            <X className={value ? "h-4 w-4" : "invisible h-4 w-4"} />
          </Button>
        </div>
        <span className="h-4" />
      </div>
    </div>
  )
}
