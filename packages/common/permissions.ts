import { ORG_PERMISSIONS, ROLE, type OrgPermission, type Role } from "./types"

// Mirrors public.has_org_permission in the database: the Admin role carries
// every permission, so an admin's stored permissions array is never consulted.
// Keep the two in step — the database is authoritative, this is the gate that
// keeps users out of screens they cannot act on.
export const hasOrgPermission = (
  role: Role | null | undefined,
  permissions: OrgPermission[] | null | undefined,
  permission: OrgPermission,
): boolean => role === ROLE.ADMIN || Boolean(permissions?.includes(permission))

export const isOrgPermission = (value: unknown): value is OrgPermission =>
  ORG_PERMISSIONS.includes(value as OrgPermission)

// Narrows arbitrary values (JWT claims, RPC responses) to the permissions we
// know about, dropping anything a newer server has started sending.
export const parseOrgPermissions = (value: unknown): OrgPermission[] =>
  Array.isArray(value) ? value.filter(isOrgPermission) : []
