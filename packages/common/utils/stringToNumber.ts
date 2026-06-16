import * as z from "zod"

export const stringToNumber = z.preprocess(
  (val) => {
    if (typeof val === "string" && val.trim() === "") return null
    const num = Number(val)
    return isNaN(num) ? undefined : num
  },
  z.number({ message: "Please enter a valid number" }).nullable(),
)
