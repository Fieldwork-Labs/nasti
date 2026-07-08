const DURATION_PATTERN = /^(\d+):([0-5]\d)(?::([0-5]\d)(?:\.\d+)?)?$/

const plural = (value: number, unit: string) =>
  `${value} ${unit}${value === 1 ? "" : "s"}`

export function parseDurationMinutes(value: string | null | undefined) {
  if (!value) return null

  const trimmed = value.trim()
  const clockMatch = trimmed.match(DURATION_PATTERN)
  if (clockMatch) {
    return Number(clockMatch[1]) * 60 + Number(clockMatch[2])
  }

  let total = 0
  const dayMatch = trimmed.match(/(\d+(?:\.\d+)?)\s+days?/i)
  const hourMatch = trimmed.match(/(\d+(?:\.\d+)?)\s+hours?/i)
  const minuteMatch = trimmed.match(/(\d+(?:\.\d+)?)\s+(?:minutes?|mins?)/i)
  const secondMatch = trimmed.match(/(\d+(?:\.\d+)?)\s+(?:seconds?|secs?)/i)

  if (dayMatch) total += Number(dayMatch[1]) * 24 * 60
  if (hourMatch) total += Number(hourMatch[1]) * 60
  if (minuteMatch) total += Number(minuteMatch[1])
  if (secondMatch) total += Number(secondMatch[1]) / 60

  return total > 0 ? Math.round(total) : null
}

export function durationToTimeValue(value: string | null | undefined) {
  const minutes = parseDurationMinutes(value)
  if (minutes === null) return ""

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

  return `${Number(hours).toString().padStart(2, "0")}:${Number(minutes)
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
