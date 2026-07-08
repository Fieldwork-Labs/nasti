import { durationPicker } from "@/platform"
import {
  durationToTimeValue,
  formatDuration,
  timeValueToDuration,
} from "@/lib/duration"
import { Button } from "@nasti/ui/button"
import { Input } from "@nasti/ui/input"
import { Label } from "@nasti/ui/label"
import { X } from "lucide-react"
import { useState } from "react"

type DurationPickerFieldProps = {
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

export function DurationPickerField({
  value,
  onChange,
}: DurationPickerFieldProps) {
  const formattedValue = formatDuration(value)
  const { hours, minutes } = parseDurationParts(value)
  const [draft, setDraft] = useState<DurationDraft>({})
  const useNativePicker = durationPicker.isNativeDurationPickerAvailable()

  const handleNativePick = async () => {
    const selectedValue = await durationPicker.pickDuration(value)
    if (selectedValue !== null) onChange(selectedValue)
  }

  const handleWebChange = (nextHours: number, nextMinutes: number) => {
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
      handleWebChange(Number(nextDraft) || 0, minutes)
    } else {
      handleWebChange(hours, Number(nextDraft) || 0)
    }
  }

  return (
    <div>
      <Label id="duration-label" htmlFor="duration">
        Duration
      </Label>
      <div className="flex items-center gap-2">
        {useNativePicker ? (
          <Button
            id="duration"
            type="button"
            variant="outline"
            className="h-12 flex-1 justify-start text-lg font-normal"
            onClick={handleNativePick}
          >
            {formattedValue ?? "Select duration"}
          </Button>
        ) : (
          <div
            id="duration"
            className="flex flex-1 items-center gap-2"
            role="group"
            aria-labelledby="duration-label"
            aria-label="Duration in hours and minutes"
          >
            <Input
              aria-label="Duration hours"
              inputMode="numeric"
              pattern="[0-9]*"
              value={draft.hours ?? toTwoDigits(hours)}
              className="h-12 text-center text-lg"
              onFocus={() => beginEdit("hours")}
              onBlur={() => endEdit("hours")}
              onChange={(event) =>
                handleSegmentChange("hours", event.currentTarget.value)
              }
            />
            <span className="text-muted-foreground text-lg">:</span>
            <Input
              aria-label="Duration minutes"
              inputMode="numeric"
              pattern="[0-9]*"
              value={draft.minutes ?? toTwoDigits(minutes)}
              className="h-12 text-center text-lg"
              onFocus={() => beginEdit("minutes")}
              onBlur={() => endEdit("minutes")}
              onChange={(event) =>
                handleSegmentChange("minutes", event.currentTarget.value)
              }
            />
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-12 w-12 shrink-0"
          aria-label="Clear duration"
          disabled={!value}
          onClick={() => onChange(null)}
        >
          <X className={value ? "h-5 w-5" : "invisible h-5 w-5"} />
        </Button>
      </div>
    </div>
  )
}
