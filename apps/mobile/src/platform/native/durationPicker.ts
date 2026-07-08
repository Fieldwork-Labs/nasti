import { DatetimePicker } from "@capawesome-team/capacitor-datetime-picker"
import type { DurationPickerService } from "../types"
import { durationToTimeValue, timeValueToDuration } from "@/lib/duration"

export const durationPicker: DurationPickerService = {
  async pickDuration(value) {
    try {
      const { value: selectedValue } = await DatetimePicker.present({
        cancelButtonText: "Cancel",
        doneButtonText: "OK",
        format: "HH:mm",
        mode: "time",
        theme: "auto",
        value: durationToTimeValue(value) || "00:00",
      })

      return timeValueToDuration(selectedValue)
    } catch {
      return null
    }
  },
}
