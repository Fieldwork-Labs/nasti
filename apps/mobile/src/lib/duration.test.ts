import { describe, expect, it } from "vitest"
import {
  durationToTimeValue,
  formatDuration,
  parseDurationMinutes,
  timeValueToDuration,
} from "./duration"

describe("duration helpers", () => {
  it("converts time input values to Postgres interval strings", () => {
    expect(timeValueToDuration("01:30")).toBe("01:30:00")
    expect(timeValueToDuration("00:05")).toBe("00:05:00")
  })

  it("formats clock-style interval values", () => {
    expect(durationToTimeValue("02:15:00")).toBe("02:15")
    expect(formatDuration("02:15:00")).toBe("2 hours 15 minutes")
  })

  it("parses verbose Postgres interval values", () => {
    expect(parseDurationMinutes("1 day 2 hours 30 minutes")).toBe(1590)
    expect(formatDuration("1 hour 1 minute")).toBe("1 hour 1 minute")
  })
})
