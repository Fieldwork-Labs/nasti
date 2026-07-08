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

type DurationPickerFieldProps = {
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

export function DurationPickerField({
  value,
  onChange,
}: DurationPickerFieldProps) {
  const formattedValue = formatDuration(value)
  const { hours, minutes } = parseDurationParts(value)
  const useNativePicker = durationPicker.isNativeDurationPickerAvailable()

  const handleNativePick = async () => {
    const selectedValue = await durationPicker.pickDuration(value)
    if (selectedValue !== null) onChange(selectedValue)
  }

  const handleWebChange = (nextHours: number, nextMinutes: number) => {
    onChange(
      timeValueToDuration(
        `${toTwoDigits(clamp(nextHours, 0, 99))}:${toTwoDigits(
          clamp(nextMinutes, 0, 59),
        )}`,
      ),
    )
  }

  return (
    <div>
      <Label htmlFor="duration">Duration</Label>
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
            aria-label="Duration in hours and minutes"
          >
            <Input
              aria-label="Duration hours"
              inputMode="numeric"
              pattern="[0-9]*"
              value={toTwoDigits(hours)}
              className="h-12 text-center text-lg"
              onChange={(event) =>
                handleWebChange(Number(event.currentTarget.value) || 0, minutes)
              }
            />
            <span className="text-muted-foreground text-lg">:</span>
            <Input
              aria-label="Duration minutes"
              inputMode="numeric"
              pattern="[0-9]*"
              value={toTwoDigits(minutes)}
              className="h-12 text-center text-lg"
              onChange={(event) =>
                handleWebChange(hours, Number(event.currentTarget.value) || 0)
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
