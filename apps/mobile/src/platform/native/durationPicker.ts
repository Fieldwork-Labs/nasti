import { Capacitor, registerPlugin } from "@capacitor/core"
import type { DurationPickerService } from "../types"
import { parseDurationMinutes, timeValueToDuration } from "@/lib/duration"

type NativeDurationPickerPlugin = {
  present(options: {
    valueMinutes?: number
    cancelButtonText?: string
    doneButtonText?: string
  }): Promise<{ valueMinutes: number }>
}

const NativeDurationPicker = registerPlugin<NativeDurationPickerPlugin>(
  "NativeDurationPicker",
)

export const durationPicker: DurationPickerService = {
  isNativeDurationPickerAvailable() {
    return Capacitor.getPlatform() === "ios"
  },

  async pickDuration(value) {
    if (!this.isNativeDurationPickerAvailable()) return null

    try {
      const selectedValue = await NativeDurationPicker.present({
        cancelButtonText: "Cancel",
        doneButtonText: "OK",
        valueMinutes: parseDurationMinutes(value) ?? 0,
      })

      const hours = Math.floor(selectedValue.valueMinutes / 60)
      const minutes = selectedValue.valueMinutes % 60

      return timeValueToDuration(
        `${hours.toString().padStart(2, "0")}:${minutes
          .toString()
          .padStart(2, "0")}`,
      )
    } catch {
      return null
    }
  },
}
