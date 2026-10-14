import * as z from "zod"

export const stringToNumber = z.preprocess(
  (val) => {
    if (typeof val === "string" && val.trim() === "") return null
    const num = Number(val)
    return isNaN(num) ? undefined : num
  },
  z.number({ message: "Please enter a valid number" }).nullable(),
)

// An optional quantity: blank means unknown, but a value given must be
// positive. Unlike stringToNumber, an untouched field stays null rather than
// becoming 0 (Number(null) is 0).
export const optionalPositiveNumber = z.preprocess(
  (val) => {
    if (val === null || val === undefined) return null
    if (typeof val === "string" && val.trim() === "") return null
    const num = Number(val)
    return isNaN(num) ? undefined : num
  },
  z
    .number({ message: "Please enter a valid number" })
    .positive("Must be greater than 0")
    .nullable(),
)
