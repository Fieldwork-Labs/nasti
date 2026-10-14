import { redirect } from "@tanstack/react-router"
import { hasOrgPermission } from "@nasti/common/permissions"
import { ROLE, type OrgPermission, type Role } from "@nasti/common/types"

// The slice of router context the area guards need. Populated once in
// /_private's beforeLoad so every guard below runs without a round trip.
export type AccessContext = {
  role: Role | null
  permissions: OrgPermission[]
}

// Where a user belongs when they land on "/" or get turned away from an area
// they cannot see. Collections first: it is the larger group by far.
export const landingRoute = ({ role, permissions }: AccessContext) => {
  if (hasOrgPermission(role, permissions, "collections")) return "/trips"
  if (hasOrgPermission(role, permissions, "inventory")) return "/inventory"
  return "/no-access"
}

export const canAccess = (
  { role, permissions }: AccessContext,
  permission: OrgPermission,
) => hasOrgPermission(role, permissions, permission)

// Throwing a redirect from beforeLoad stops the route loading entirely — the
// components and their queries never mount, so a member without the
// permission never issues a request the database would reject anyway.
export const requirePermission = (
  access: AccessContext,
  permission: OrgPermission,
) => {
  if (canAccess(access, permission)) return
  throw redirect({ to: landingRoute(access) })
}

export const requireAdmin = (access: AccessContext) => {
  if (access.role === ROLE.ADMIN) return
  throw redirect({ to: landingRoute(access) })
}
