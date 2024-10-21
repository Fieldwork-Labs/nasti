import { Database } from "./database"

type Table<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"]

export type Organisation = Table<"organisation">

export type Role = "admin" | "member"
