import { Database } from "./database"

type Table<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"]
type Function<T extends keyof Database["public"]["Functions"]> =
  Database["public"]["Functions"][T]

export type Organisation = Table<"organisation">
export type Invitation = Table<"invitation">
export type Trip = Table<"trip">
export type GetOrgUsers = Function<"get_organisation_users">

export type Role = "Admin" | "Member" | "Owner"

export enum ROLE {
  ADMIN = "Admin",
  MEMBER = "Member",
  OWNER = "Owner",
}
