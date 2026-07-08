export const MAX_DURATION_MINUTES = 23 * 60 + 59

const DURATION_PATTERN = /^(\d+):([0-5]\d)(?::([0-5]\d)(?:\.\d+)?)?$/
const EMBEDDED_DURATION_PATTERN =
  /(?:^|\s)(\d+):([0-5]\d)(?::([0-5]\d)(?:\.\d+)?)?(?:\s|$)/

const plural = (value: number, unit: string) =>
  `${value} ${unit}${value === 1 ? "" : "s"}`

export function parseDurationMinutes(value: string | null | undefined) {
  if (!value) return null

  const trimmed = value.trim()
  const clockMatch = trimmed.match(DURATION_PATTERN)
  if (clockMatch) {
    const total = Number(clockMatch[1]) * 60 + Number(clockMatch[2])
    return total > 0 ? Math.round(total) : null
  }

  let total = 0
  const embeddedClockMatch = trimmed.match(EMBEDDED_DURATION_PATTERN)
  const dayMatch = trimmed.match(/(\d+(?:\.\d+)?)\s+days?/i)
  const hourMatch = trimmed.match(/(\d+(?:\.\d+)?)\s+hours?/i)
  const minuteMatch = trimmed.match(/(\d+(?:\.\d+)?)\s+(?:minutes?|mins?)/i)
  const secondMatch = trimmed.match(/(\d+(?:\.\d+)?)\s+(?:seconds?|secs?)/i)

  if (dayMatch) total += Number(dayMatch[1]) * 24 * 60
  if (embeddedClockMatch)
    total +=
      Number(embeddedClockMatch[1]) * 60 +
      Number(embeddedClockMatch[2]) +
      Number(embeddedClockMatch[3] ?? 0) / 60
  if (hourMatch) total += Number(hourMatch[1]) * 60
  if (minuteMatch) total += Number(minuteMatch[1])
  if (secondMatch) total += Number(secondMatch[1]) / 60

  return total > 0 ? Math.round(total) : null
}

export function clampDurationMinutes(minutes: number) {
  if (!Number.isFinite(minutes)) return 0
  return Math.min(Math.max(Math.round(minutes), 0), MAX_DURATION_MINUTES)
}

export function durationToTimeValue(value: string | null | undefined) {
  const parsedMinutes = parseDurationMinutes(value)
  if (parsedMinutes === null) return ""

  const minutes = clampDurationMinutes(parsedMinutes)
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return `${hours.toString().padStart(2, "0")}:${remainder
    .toString()
    .padStart(2, "0")}`
}

export function timeValueToDuration(value: string | null | undefined) {
  if (!value) return null

  const [hours, minutes] = value.split(":")
  if (hours === undefined || minutes === undefined) return null

  const totalMinutes = clampDurationMinutes(
    Number(hours) * 60 + Number(minutes),
  )
  if (totalMinutes === 0) return null

  const clampedHours = Math.floor(totalMinutes / 60)
  const clampedMinutes = totalMinutes % 60

  return `${clampedHours.toString().padStart(2, "0")}:${clampedMinutes
    .toString()
    .padStart(2, "0")}:00`
}

export function formatDuration(value: string | null | undefined) {
  const minutes = parseDurationMinutes(value)
  if (minutes === null) return null

  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  const parts = []

  if (hours > 0) parts.push(plural(hours, "hour"))
  if (remainder > 0 || parts.length === 0)
    parts.push(plural(remainder, "minute"))

  return parts.join(" ")
}
