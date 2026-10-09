import { z } from "zod"

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const isRealIsoDate = (value: string) => {
  if (!ISO_DATE_PATTERN.test(value)) return false

  const [year, month, day] = value.split("-").map(Number)
  const candidate = new Date(Date.UTC(2000, 0, 1))
  candidate.setUTCFullYear(year, month - 1, day)

  return (
    year >= 1 &&
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  )
}

export const collectedOnSchema = z
  .string()
  .min(1, "Collection date is required")
  .refine(isRealIsoDate, "Enter a valid collection date")

// HTML date inputs use YYYY-MM-DD values. Build this from local date parts so
// users near a UTC date boundary still receive their local calendar date.
export const formatDateInputValue = (date: Date) => {
  const year = String(date.getFullYear()).padStart(4, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}
