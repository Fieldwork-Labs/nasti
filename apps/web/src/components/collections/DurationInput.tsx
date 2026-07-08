import { Button } from "@nasti/ui/button"
import { Input } from "@nasti/ui/input"
import { Label } from "@nasti/ui/label"
import { X } from "lucide-react"
import { useState } from "react"

import { durationToTimeValue, timeValueToDuration } from "@/lib/duration"

type DurationInputProps = {
  value: string | null
  onChange: (value: string | null) => void
}

type DurationSegment = "hours" | "minutes"
type DurationDraft = Partial<Record<DurationSegment, string>>

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

const toTwoDigits = (value: number) => value.toString().padStart(2, "0")

const cleanSegmentInput = (value: string) =>
  value.replace(/\D/g, "").slice(0, 2)

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
  const [draft, setDraft] = useState<DurationDraft>({})

  const handleChange = (nextHours: number, nextMinutes: number) => {
    onChange(
      timeValueToDuration(
        `${toTwoDigits(clamp(nextHours, 0, 23))}:${toTwoDigits(
          clamp(nextMinutes, 0, 59),
        )}`,
      ),
    )
  }

  const beginEdit = (segment: DurationSegment) => {
    setDraft((current) => ({ ...current, [segment]: "" }))
  }

  const endEdit = (segment: DurationSegment) => {
    setDraft((current) => {
      const next = { ...current }
      delete next[segment]
      return next
    })
  }

  const handleSegmentChange = (segment: DurationSegment, value: string) => {
    const nextDraft = cleanSegmentInput(value)
    setDraft((current) => ({ ...current, [segment]: nextDraft }))

    if (segment === "hours") {
      handleChange(Number(nextDraft) || 0, minutes)
    } else {
      handleChange(hours, Number(nextDraft) || 0)
    }
  }

  return (
    <div className="form-group flex w-full flex-col gap-2">
      <div className="grid w-full items-center gap-1.5">
        <Label id="duration-label" htmlFor="duration-hours">
          Duration
        </Label>
        <div className="flex items-center gap-2">
          <div
            className="flex flex-1 items-center gap-2"
            role="group"
            aria-labelledby="duration-label"
            aria-label="Duration in hours and minutes"
          >
            <Input
              id="duration-hours"
              aria-label="Duration hours"
              inputMode="numeric"
              pattern="[0-9]*"
              value={draft.hours ?? toTwoDigits(hours)}
              className="text-center"
              onFocus={() => beginEdit("hours")}
              onBlur={() => endEdit("hours")}
              onChange={(event) =>
                handleSegmentChange("hours", event.currentTarget.value)
              }
            />
            <span className="text-muted-foreground">:</span>
            <Input
              aria-label="Duration minutes"
              inputMode="numeric"
              pattern="[0-9]*"
              value={draft.minutes ?? toTwoDigits(minutes)}
              className="text-center"
              onFocus={() => beginEdit("minutes")}
              onBlur={() => endEdit("minutes")}
              onChange={(event) =>
                handleSegmentChange("minutes", event.currentTarget.value)
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
