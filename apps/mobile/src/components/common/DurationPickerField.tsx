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

export function DurationPickerField({
  value,
  onChange,
}: DurationPickerFieldProps) {
  const formattedValue = formatDuration(value)

  const handleNativePick = async () => {
    const selectedValue = await durationPicker.pickDuration(value)
    if (selectedValue !== null) onChange(selectedValue)
  }

  return (
    <div>
      <Label htmlFor="duration">Duration</Label>
      <div className="flex items-center gap-2">
        {__NASTI_TARGET__ === "capacitor" ? (
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
          <Input
            id="duration"
            type="time"
            step={60}
            value={durationToTimeValue(value)}
            className="h-12 flex-1 text-lg"
            onChange={(event) =>
              onChange(timeValueToDuration(event.currentTarget.value))
            }
          />
        )}
        {value && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-12 w-12 shrink-0"
            aria-label="Clear duration"
            onClick={() => onChange(null)}
          >
            <X className="h-5 w-5" />
          </Button>
        )}
      </div>
    </div>
  )
}
