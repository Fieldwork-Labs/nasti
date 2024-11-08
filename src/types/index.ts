import { Database } from "./database"

type Table<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"]

export type Organisation = Table<"organisation">
export type Invitation = Table<"invitation">
export type Trip = Table<"trip">

export type Role = "Admin" | "Member" | "Owner"

export enum ROLE {
  ADMIN = "Admin",
  MEMBER = "Member",
  OWNER = "Owner",
}
