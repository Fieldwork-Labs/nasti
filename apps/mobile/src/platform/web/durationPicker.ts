import type { DurationPickerService } from "../types"

export const durationPicker: DurationPickerService = {
  isNativeDurationPickerAvailable() {
    return false
  },

  async pickDuration() {
    return null
  },
}
